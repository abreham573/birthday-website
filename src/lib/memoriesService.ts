import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  deleteCachedMediaBlob,
  getCachedLetter,
  getCachedMediaBlob,
  getCachedMemoriesList,
  saveCachedLetter,
  saveCachedMediaBlob,
  saveCachedMemoriesList,
} from './mediaCache';
import { LoveLetterData, MemoryItem } from '../types';

const CHUNK_SIZE = 650000;
const MAX_CHUNKS = 40;
const MAX_VIDEO_BYTES = 18 * 1024 * 1024; // ~18MB max video (~24MB base64 <= 40 chunks)

export function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('quota exceeded') ||
    lower.includes('quota limit exceeded') ||
    lower.includes('resource-exhausted')
  );
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  // Keep animated GIFs intact unless huge
  if (file.type === 'image/gif' && file.size <= 600 * 1024) {
    return { dataUrl: await readFileAsDataUrl(file), mimeType: file.type };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const maxDim = 1440;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const fallbackUrl = await readFileAsDataUrl(file);
          resolve({ dataUrl: fallbackUrl, mimeType: file.type || 'image/jpeg' });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.84;
        let output = canvas.toDataURL('image/jpeg', quality);
        if (output.length > 650000) {
          quality = 0.7;
          output = canvas.toDataURL('image/jpeg', quality);
        }
        if (output.length > 850000) {
          const scale = 0.75;
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          output = canvas.toDataURL('image/jpeg', 0.72);
        }

        resolve({ dataUrl: output, mimeType: 'image/jpeg' });
      } catch {
        const fallbackUrl = await readFileAsDataUrl(file);
        resolve({ dataUrl: fallbackUrl, mimeType: file.type || 'image/jpeg' });
      }
    };

    img.onerror = async () => {
      URL.revokeObjectURL(objectUrl);
      const fallbackUrl = await readFileAsDataUrl(file);
      resolve({ dataUrl: fallbackUrl, mimeType: file.type || 'image/jpeg' });
    };

    img.src = objectUrl;
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    if (!dataUrl.startsWith('data:')) return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch {
    return null;
  }
}

export async function uploadMemoryFileToFirestore(params: {
  file: File;
  mediaType: 'photo' | 'video';
  title: string;
  caption: string;
  date: string;
  tag: string;
  authorId: string;
  onProgress?: (pct: number) => void;
}): Promise<MemoryItem> {
  const { file, mediaType, title, caption, date, tag, authorId, onProgress } = params;

  if (mediaType === 'video' && file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `Video "${file.name}" is larger than 18 MB. Please trim or compress it slightly before uploading.`
    );
  }

  onProgress?.(15);

  let dataUrl = '';
  let mimeType = file.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

  if (mediaType === 'photo') {
    const compressed = await compressImageFile(file);
    dataUrl = compressed.dataUrl;
    mimeType = compressed.mimeType;
  } else {
    dataUrl = await readFileAsDataUrl(file);
  }

  onProgress?.(40);

  const memoryId = sanitizeId(
    `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const aspectRatio: '4:3' | '16:9' = mediaType === 'video' ? '16:9' : '4:3';
  const safeTitle = title.trim().slice(0, 160) || 'My Beautiful Tsi';
  const safeCaption =
    caption.trim().slice(0, 1000) || 'A cherished memory of my love, Tsi.';
  const safeDate = date.trim().slice(0, 80) || 'Special Moment';
  const safeTag = tag.trim().slice(0, 60) || 'Birthday Special';

  const memoryRef = doc(db, 'memories', memoryId);

  if (dataUrl.length <= 850000) {
    // Store inline in single Firestore document
    try {
      await setDoc(memoryRef, {
        type: mediaType,
        url: dataUrl,
        mimeType: mimeType.slice(0, 100),
        isChunked: false,
        chunkCount: 0,
        title: safeTitle,
        caption: safeCaption,
        date: safeDate,
        tag: safeTag,
        aspectRatio,
        authorId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `memories/${memoryId}`);
    }

    onProgress?.(100);
    return {
      id: memoryId,
      type: mediaType,
      url: dataUrl,
      title: safeTitle,
      caption: safeCaption,
      date: safeDate,
      tag: safeTag,
      aspectRatio,
      isCustom: true,
      isChunked: false,
    };
  }

  // Split into chunks for larger files (e.g. video clips)
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += CHUNK_SIZE) {
    chunks.push(dataUrl.slice(i, i + CHUNK_SIZE));
  }

  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      `File "${file.name}" exceeds the maximum cloud storage size per item (~18 MB).`
    );
  }

  try {
    const batch = writeBatch(db);
    batch.set(memoryRef, {
      type: mediaType,
      url: '',
      mimeType: mimeType.slice(0, 100),
      isChunked: true,
      chunkCount: chunks.length,
      title: safeTitle,
      caption: safeCaption,
      date: safeDate,
      tag: safeTag,
      aspectRatio,
      authorId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    chunks.forEach((chunkData, index) => {
      const chunkRef = doc(db, 'memories', memoryId, 'chunks', `chunk_${index}`);
      batch.set(chunkRef, {
        index,
        data: chunkData,
        authorId,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `memories/${memoryId}`);
  }

  // Cache chunked blob locally right away so uploader never re-reads chunks
  const blob = dataUrlToBlob(dataUrl);
  if (blob) {
    await saveCachedMediaBlob(memoryId, blob);
  }

  onProgress?.(100);

  const playableUrl = blob ? URL.createObjectURL(blob) : dataUrl;
  return {
    id: memoryId,
    type: mediaType,
    url: playableUrl,
    title: safeTitle,
    caption: safeCaption,
    date: safeDate,
    tag: safeTag,
    aspectRatio,
    isCustom: true,
    isChunked: true,
  };
}

export async function saveMemoryUrlToFirestore(params: {
  url: string;
  mediaType: 'photo' | 'video';
  title: string;
  caption: string;
  date: string;
  tag: string;
  authorId: string;
}): Promise<MemoryItem> {
  const { url, mediaType, title, caption, date, tag, authorId } = params;
  const memoryId = sanitizeId(
    `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const aspectRatio: '4:3' | '16:9' = mediaType === 'video' ? '16:9' : '4:3';
  const safeTitle = title.trim().slice(0, 160) || 'My Beautiful Tsi';
  const safeCaption =
    caption.trim().slice(0, 1000) || 'A cherished memory of my love, Tsi.';
  const safeDate = date.trim().slice(0, 80) || 'Special Moment';
  const safeTag = tag.trim().slice(0, 60) || 'Birthday Special';
  const safeUrl = url.trim().slice(0, 900000);

  try {
    await setDoc(doc(db, 'memories', memoryId), {
      type: mediaType,
      url: safeUrl,
      mimeType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      isChunked: false,
      chunkCount: 0,
      title: safeTitle,
      caption: safeCaption,
      date: safeDate,
      tag: safeTag,
      aspectRatio,
      authorId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `memories/${memoryId}`);
  }

  return {
    id: memoryId,
    type: mediaType,
    url: safeUrl,
    title: safeTitle,
    caption: safeCaption,
    date: safeDate,
    tag: safeTag,
    aspectRatio,
    isCustom: true,
    isChunked: false,
  };
}

export async function resolveChunkedMemoryUrl(memoryId: string): Promise<string> {
  // 1. Check local IndexedDB cache first (0 Firestore reads!)
  const cachedBlob = await getCachedMediaBlob(memoryId);
  if (cachedBlob) {
    return URL.createObjectURL(cachedBlob);
  }

  // 2. Fetch immutable chunks from Firestore once and cache locally
  const chunksPath = `memories/${memoryId}/chunks`;
  try {
    const chunksQuery = query(
      collection(db, 'memories', memoryId, 'chunks'),
      orderBy('index', 'asc')
    );
    const chunksSnap = await getDocs(chunksQuery);
    const fullDataUrl = chunksSnap.docs
      .map((c) => c.data().data as string)
      .join('');
    if (!fullDataUrl) return '';

    const blob = dataUrlToBlob(fullDataUrl);
    if (blob) {
      await saveCachedMediaBlob(memoryId, blob);
      return URL.createObjectURL(blob);
    }
    return fullDataUrl;
  } catch (chunkErr) {
    handleFirestoreError(chunkErr, OperationType.LIST, chunksPath);
  }
}

export async function fetchMemoriesFromFirestore(): Promise<MemoryItem[]> {
  const path = 'memories';
  try {
    const q = query(
      collection(db, path),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const snapshot = await getDocs(q);

    const items: MemoryItem[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const mediaType: 'photo' | 'video' = data.type === 'video' ? 'video' : 'photo';
      const isChunked = Boolean(data.isChunked);
      let resolvedUrl: string = typeof data.url === 'string' ? data.url : '';

      if (isChunked) {
        // Always check local IndexedDB cache first to avoid Firestore chunk reads
        const cachedBlob = await getCachedMediaBlob(docSnap.id);
        if (cachedBlob) {
          resolvedUrl = URL.createObjectURL(cachedBlob);
        } else if (mediaType === 'photo') {
          // Photos need thumbnails on gallery load; videos lazy-load on click in Lightbox
          resolvedUrl = await resolveChunkedMemoryUrl(docSnap.id);
        }
      }

      if (resolvedUrl || (isChunked && mediaType === 'video')) {
        items.push({
          id: docSnap.id,
          type: mediaType,
          url: resolvedUrl,
          title: data.title || 'Tsi Memory',
          caption: data.caption || '',
          date: data.date || 'Special Moment',
          tag: data.tag || 'Birthday Special',
          aspectRatio: data.aspectRatio || (mediaType === 'video' ? '16:9' : '4:3'),
          isCustom: true,
          isChunked,
        });
      }
    }

    // Save lightweight metadata fallback in IndexedDB
    await saveCachedMemoriesList(items);
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getCachedMemoriesFallback(): Promise<MemoryItem[]> {
  const cached = await getCachedMemoriesList();
  if (!cached || cached.length === 0) return [];

  return Promise.all(
    cached.map(async (item) => {
      if (!item.url && item.isChunked) {
        const cachedBlob = await getCachedMediaBlob(item.id);
        if (cachedBlob) {
          return { ...item, url: URL.createObjectURL(cachedBlob) };
        }
      }
      return item;
    })
  );
}

export async function deleteMemoryFromFirestore(memoryId: string): Promise<void> {
  const path = `memories/${memoryId}`;
  try {
    const memoryRef = doc(db, 'memories', memoryId);
    const snap = await getDoc(memoryRef);
    const batch = writeBatch(db);

    if (snap.exists() && snap.data().isChunked) {
      const chunksSnap = await getDocs(
        collection(db, 'memories', memoryId, 'chunks')
      );
      chunksSnap.docs.forEach((c) => batch.delete(c.ref));
    }

    batch.delete(memoryRef);
    await batch.commit();
    await deleteCachedMediaBlob(memoryId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchLetterFromFirestore(): Promise<LoveLetterData | null> {
  const path = 'letter/birthday';
  try {
    const snap = await getDoc(doc(db, 'letter', 'birthday'));
    if (!snap.exists()) return null;
    const data = snap.data();
    const letter: LoveLetterData = {
      recipient: data.recipient || 'Tsi',
      notice: data.notice || '',
      salutation: data.salutation || 'Happy Birthday, My Sunshine ❤️',
      paragraphs: Array.isArray(data.paragraphs) ? data.paragraphs : [],
      closing: data.closing || 'With all my love,',
      signature: data.signature || 'Yours ❤️',
      anniversaryDate: data.anniversaryDate || 'On Your Special Birthday',
    };
    await saveCachedLetter(letter);
    return letter;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getCachedLetterFallback(): Promise<LoveLetterData | null> {
  return getCachedLetter();
}

export async function saveLetterToFirestore(
  letter: LoveLetterData,
  authorId: string
): Promise<void> {
  const path = 'letter/birthday';
  const letterRef = doc(db, 'letter', 'birthday');
  const paragraphs = letter.paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 30);

  if (paragraphs.length === 0) {
    paragraphs.push('Happy Birthday, Tsi ❤️');
  }

  try {
    const existing = await getDoc(letterRef);
    if (!existing.exists()) {
      await setDoc(letterRef, {
        recipient: (letter.recipient || 'Tsi').slice(0, 80),
        notice: (letter.notice || '').slice(0, 400),
        salutation: (letter.salutation || 'Happy Birthday').slice(0, 160),
        paragraphs,
        closing: (letter.closing || 'With all my love,').slice(0, 120),
        signature: (letter.signature || 'Yours ❤️').slice(0, 120),
        anniversaryDate: (letter.anniversaryDate || 'On Your Special Birthday').slice(0, 80),
        authorId,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(letterRef, {
        recipient: (letter.recipient || 'Tsi').slice(0, 80),
        notice: (letter.notice || '').slice(0, 400),
        salutation: (letter.salutation || 'Happy Birthday').slice(0, 160),
        paragraphs,
        closing: (letter.closing || 'With all my love,').slice(0, 120),
        signature: (letter.signature || 'Yours ❤️').slice(0, 120),
        anniversaryDate: (letter.anniversaryDate || 'On Your Special Birthday').slice(0, 80),
        updatedAt: serverTimestamp(),
      });
    }
    await saveCachedLetter({ ...letter, paragraphs });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
