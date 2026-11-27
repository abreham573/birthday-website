import {
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  Query,
  query,
  QueryDocumentSnapshot,
  QuerySnapshot,
  startAfter,
} from 'firebase/firestore';
import {
  auth,
  db,
  lockFirestoreForQuota,
  unlockFirestoreForRetry,
} from './firebase';
import {
  getCachedGateConfig,
  getCachedLetter,
  getCachedMediaBlob,
  getCachedMemoriesList,
  getCachedSongConfig,
  saveCachedGateConfig,
  saveCachedLetter,
  saveCachedMediaBlob,
  saveCachedMemoriesList,
  saveCachedSongConfig,
} from './mediaCache';
import { DEFAULT_LOVE_LETTER } from '../data/defaultLetter';
import { AccessGateConfig, LoveLetterData, MemoryItem, SongConfig } from '../types';

export interface DbStatus {
  configured: boolean;
  connected: boolean;
  error?: string;
  counts: {
    memories: number;
    hasGate: boolean;
    hasLetter: boolean;
    hasSong: boolean;
  };
}

export interface MigrationResult {
  gateTransferred: boolean;
  letterTransferred: boolean;
  songTransferred: boolean;
  memoriesTransferred: number;
  memoriesTotalFound: number;
  skippedDueToQuota: number;
  firestoreBlockedByQuota: boolean;
  errors: string[];
}

let cachedStatus: { value: DbStatus; fetchedAt: number } | null = null;

async function getOwnerBearerHeader(
  forceRefresh = false
): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with the creator Google account first.');
  }
  const token = await user.getIdToken(forceRefresh);
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

class RetryableUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableUploadError';
  }
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trimStart();
  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status}).`);
    }
    throw new RetryableUploadError(
      `Server returned an empty response (${res.status}).`
    );
  }

  if (trimmed.startsWith('<')) {
    throw new RetryableUploadError(
      'Upload could not reach the server API (the preview session may have refreshed). Please refresh the page and try again.'
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new RetryableUploadError(
      `Server returned an unexpected response (${res.status}).`
    );
  }

  if (!res.ok || parsed.success === false) {
    const errMsg =
      typeof parsed.error === 'string' && parsed.error.trim().length > 0
        ? parsed.error
        : `Request failed (${res.status}).`;
    if (res.status === 401 || res.status >= 500) {
      throw new RetryableUploadError(errMsg);
    }
    throw new Error(errMsg);
  }
  return parsed as T;
}

async function runWithOwnerRetry<T>(
  operation: (headers: Record<string, string>) => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const headers = await getOwnerBearerHeader(attempt > 0);
      return await operation(headers);
    } catch (err) {
      lastErr = err;
      const isRetryable =
        err instanceof RetryableUploadError ||
        (err instanceof TypeError && err.message.toLowerCase().includes('fetch'));
      if (!isRetryable || attempt === maxAttempts - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fetchDbStatus(forceRefresh = false): Promise<DbStatus> {
  if (!forceRefresh && cachedStatus && Date.now() - cachedStatus.fetchedAt < 10000) {
    return cachedStatus.value;
  }
  try {
    const res = await fetch('/api/db/status', { cache: 'no-store' });
    const data = await parseApiJson<{
      success: boolean;
      configured: boolean;
      connected: boolean;
      error?: string;
      counts: DbStatus['counts'];
    }>(res);
    const status: DbStatus = {
      configured: Boolean(data.configured),
      connected: Boolean(data.connected),
      error: data.error,
      counts: data.counts || {
        memories: 0,
        hasGate: false,
        hasLetter: false,
        hasSong: false,
      },
    };
    cachedStatus = { value: status, fetchedAt: Date.now() };
    return status;
  } catch (err) {
    return {
      configured: false,
      connected: false,
      error: err instanceof Error ? err.message : 'Unable to check database status.',
      counts: { memories: 0, hasGate: false, hasLetter: false, hasSong: false },
    };
  }
}

export function invalidateDbStatusCache(): void {
  cachedStatus = null;
}

export async function fetchGateFromPostgres(): Promise<AccessGateConfig | null> {
  const res = await fetch('/api/gate', { cache: 'no-store' });
  const data = await parseApiJson<{ config: AccessGateConfig | null }>(res);
  if (data.config) {
    void saveCachedGateConfig(data.config);
  }
  return data.config;
}

export async function saveGateToPostgres(
  config: AccessGateConfig
): Promise<AccessGateConfig> {
  const headers = await getOwnerBearerHeader();
  const res = await fetch('/api/gate', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(config),
  });
  const data = await parseApiJson<{ config: AccessGateConfig }>(res);
  void saveCachedGateConfig(data.config);
  invalidateDbStatusCache();
  return data.config;
}

export async function fetchLetterFromPostgres(): Promise<LoveLetterData | null> {
  const res = await fetch('/api/letter', { cache: 'no-store' });
  const data = await parseApiJson<{ letter: LoveLetterData | null }>(res);
  if (data.letter) {
    void saveCachedLetter(data.letter);
  }
  return data.letter;
}

export async function saveLetterToPostgres(
  letter: LoveLetterData
): Promise<LoveLetterData> {
  const headers = await getOwnerBearerHeader();
  const res = await fetch('/api/letter', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(letter),
  });
  const data = await parseApiJson<{ letter: LoveLetterData }>(res);
  void saveCachedLetter(data.letter);
  invalidateDbStatusCache();
  return data.letter;
}

export async function fetchSongFromPostgres(): Promise<SongConfig | null> {
  const res = await fetch('/api/song', { cache: 'no-store' });
  const data = await parseApiJson<{ song: SongConfig | null }>(res);
  if (data.song) {
    void saveCachedSongConfig(data.song);
  }
  return data.song;
}

export async function saveSongToPostgres(song: SongConfig): Promise<SongConfig> {
  const headers = await getOwnerBearerHeader();
  const res = await fetch('/api/song', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(song),
  });
  const data = await parseApiJson<{ song: SongConfig }>(res);
  void saveCachedSongConfig(data.song);
  invalidateDbStatusCache();
  return data.song;
}

export async function fetchMemoriesFromPostgres(): Promise<MemoryItem[]> {
  const res = await fetch('/api/memories', { cache: 'no-store' });
  const data = await parseApiJson<{ memories: MemoryItem[] }>(res);
  if (Array.isArray(data.memories) && data.memories.length > 0) {
    void saveCachedMemoriesList(data.memories);
  }
  return Array.isArray(data.memories) ? data.memories : [];
}

const POSTGRES_CHUNK_THRESHOLD_BYTES = 2.5 * 1024 * 1024; // 2.5 MB
const POSTGRES_CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB per request

export async function uploadMemoryFileToPostgres(params: {
  file: File;
  mediaType: 'photo' | 'video';
  title: string;
  caption: string;
  date: string;
  tag: string;
  onProgress?: (pct: number) => void;
}): Promise<MemoryItem> {
  if (params.file.size <= POSTGRES_CHUNK_THRESHOLD_BYTES) {
    const data = await runWithOwnerRetry(async (headers) => {
      const formData = new FormData();
      formData.append('file', params.file);
      formData.append('mediaType', params.mediaType);
      formData.append('title', params.title);
      formData.append('caption', params.caption);
      formData.append('date', params.date);
      formData.append('tag', params.tag);

      const res = await fetch('/api/memories/upload', {
        method: 'POST',
        headers,
        body: formData,
      });
      return parseApiJson<{ newItems: MemoryItem[] }>(res);
    });

    if (!data.newItems || data.newItems.length === 0) {
      throw new Error('Server did not return the uploaded item.');
    }
    invalidateDbStatusCache();
    params.onProgress?.(100);
    return data.newItems[0];
  }

  // Chunked upload in 2 MB parts for larger videos (up to 100 MB)
  const totalChunks = Math.ceil(params.file.size / POSTGRES_CHUNK_SIZE_BYTES);
  const initData = await runWithOwnerRetry(async (headers) => {
    const res = await fetch('/api/memories/upload/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        mediaType: params.mediaType,
        mimeType:
          params.file.type ||
          (params.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
        title: params.title,
        caption: params.caption,
        date: params.date,
        tag: params.tag,
        totalChunks,
        totalSize: params.file.size,
      }),
    });
    return parseApiJson<{ memoryId: string }>(res);
  });

  const memoryId = initData.memoryId;
  params.onProgress?.(5);

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * POSTGRES_CHUNK_SIZE_BYTES;
      const end = Math.min(params.file.size, start + POSTGRES_CHUNK_SIZE_BYTES);
      const chunkBlob = params.file.slice(start, end);

      await runWithOwnerRetry(async (headers) => {
        const formData = new FormData();
        formData.append('memoryId', memoryId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('chunk', chunkBlob, `chunk_${chunkIndex}.bin`);

        const res = await fetch('/api/memories/upload/chunk', {
          method: 'POST',
          headers,
          body: formData,
        });
        return parseApiJson<{ success: boolean }>(res);
      });

      const pct = Math.min(95, Math.round(((chunkIndex + 1) / totalChunks) * 90) + 5);
      params.onProgress?.(pct);
    }

    const completeData = await runWithOwnerRetry(async (headers) => {
      const res = await fetch('/api/memories/upload/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ memoryId, totalChunks }),
      });
      return parseApiJson<{ item: MemoryItem }>(res);
    });

    if (!completeData.item) {
      throw new Error('Could not finalize uploaded video.');
    }

    invalidateDbStatusCache();
    params.onProgress?.(100);
    return completeData.item;
  } catch (err) {
    await deleteMemoryFromPostgres(memoryId).catch(() => {});
    throw err;
  }
}

export async function saveMemoryUrlToPostgres(params: {
  url: string;
  mediaType: 'photo' | 'video';
  title: string;
  caption: string;
  date: string;
  tag: string;
}): Promise<MemoryItem> {
  const headers = await getOwnerBearerHeader();
  const res = await fetch('/api/memories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(params),
  });
  const data = await parseApiJson<{ item: MemoryItem | null }>(res);
  if (!data.item) {
    throw new Error('Could not save media link.');
  }
  invalidateDbStatusCache();
  return data.item;
}

export async function updateMemoryInPostgres(params: {
  memoryId: string;
  title: string;
  caption: string;
  date: string;
  tag: string;
}): Promise<{ title: string; caption: string; date: string; tag: string }> {
  const headers = await getOwnerBearerHeader();
  const res = await fetch(`/api/memories/${encodeURIComponent(params.memoryId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      title: params.title,
      caption: params.caption,
      date: params.date,
      tag: params.tag,
    }),
  });
  const data = await parseApiJson<{
    updated: { title: string; caption: string; date: string; tag: string };
  }>(res);
  return data.updated;
}

export async function deleteMemoryFromPostgres(memoryId: string): Promise<void> {
  const headers = await getOwnerBearerHeader();
  const res = await fetch(`/api/memories/${encodeURIComponent(memoryId)}`, {
    method: 'DELETE',
    headers,
  });
  await parseApiJson<{ success: boolean }>(res);
  invalidateDbStatusCache();
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

function isQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('quota exceeded') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('resource-exhausted')
  );
}

/**
 * Transfers all data (password gate, love letter + photo, song + cover photo, and all photos/videos)
 * from Firebase Firestore AND/OR this device's local IndexedDB cache directly into PostgreSQL.
 */
export async function migrateFirebaseToPostgres(
  onProgress?: (status: string) => void
): Promise<MigrationResult> {
  const result: MigrationResult = {
    gateTransferred: false,
    letterTransferred: false,
    songTransferred: false,
    memoriesTransferred: 0,
    memoriesTotalFound: 0,
    skippedDueToQuota: 0,
    firestoreBlockedByQuota: false,
    errors: [],
  };

  const status = await fetchDbStatus(true);
  if (!status.configured) {
    throw new Error(
      'DATABASE_URL is not configured yet. Add your PostgreSQL URL in AI Studio Settings -> Secrets first.'
    );
  }
  if (!status.connected) {
    throw new Error(
      status.error || 'Cannot connect to PostgreSQL right now. Check DATABASE_URL.'
    );
  }

  const headers = await getOwnerBearerHeader();

  // Re-enable Firestore network explicitly for this manual migration attempt
  await unlockFirestoreForRetry().catch(() => {});
  let firestoreBlocked = false;

  const markQuotaBlocked = () => {
    firestoreBlocked = true;
    result.firestoreBlockedByQuota = true;
    lockFirestoreForQuota();
  };

  // Helper to upload a single memory item immediately to PostgreSQL
  const uploadOneMemory = async (
    item: MemoryItem & { sortOrder?: number },
    index: number,
    totalKnown: number
  ): Promise<boolean> => {
    const label = totalKnown > 0 ? `${index + 1} of ${totalKnown}` : `${index + 1}`;
    onProgress?.(
      `Transferring ${item.type === 'video' ? 'video' : 'photo'} ${label}...`
    );

    let mediaBlob: Blob | null = await getCachedMediaBlob(item.id);
    if (!mediaBlob && item.url.startsWith('data:')) {
      mediaBlob = dataUrlToBlob(item.url);
    }

    if (!mediaBlob && item.isChunked) {
      if (firestoreBlocked) {
        result.skippedDueToQuota++;
        return false;
      }
      try {
        const chunksSnap = await getDocs(
          query(collection(db, 'memories', item.id, 'chunks'), orderBy('index', 'asc'))
        );
        const fullDataUrl = chunksSnap.docs
          .map((c) => c.data().data as string)
          .join('');
        if (fullDataUrl) {
          mediaBlob = dataUrlToBlob(fullDataUrl);
          if (mediaBlob) {
            void saveCachedMediaBlob(item.id, mediaBlob);
          }
        }
      } catch (chunkErr) {
        if (isQuotaError(chunkErr)) {
          markQuotaBlocked();
          result.skippedDueToQuota++;
          return false;
        }
        throw chunkErr;
      }
    }

    const formData = new FormData();
    formData.append('id', item.id);
    formData.append('type', item.type);
    formData.append('title', item.title || 'Tsi');
    formData.append('caption', item.caption || '');
    formData.append('date', item.date || '');
    formData.append('tag', item.tag || '');
    formData.append(
      'aspectRatio',
      item.aspectRatio || (item.type === 'video' ? '16:9' : '4:3')
    );
    formData.append('sortOrder', String(item.sortOrder || Date.now() - index * 1000));

    if (mediaBlob) {
      const ext =
        item.type === 'video'
          ? mediaBlob.type.includes('webm')
            ? 'webm'
            : 'mp4'
          : 'jpg';
      formData.append('file', mediaBlob, `${item.id}.${ext}`);
    } else if (item.url && !item.url.startsWith('blob:')) {
      formData.append('url', item.url);
    } else {
      result.skippedDueToQuota++;
      return false;
    }

    const res = await fetch('/api/migrate/memory', {
      method: 'POST',
      headers,
      body: formData,
    });
    await parseApiJson<{ success: boolean }>(res);
    return true;
  };

  // 1. Transfer Front-Page Password Gate
  onProgress?.('Checking front-page password & hint...');
  let gateToSave: AccessGateConfig | null = null;
  if (!firestoreBlocked) {
    try {
      const snap = await getDoc(doc(db, 'gate', 'config'));
      if (snap.exists()) {
        const d = snap.data();
        gateToSave = {
          passwordHash: typeof d.passwordHash === 'string' ? d.passwordHash : '',
          hint: typeof d.hint === 'string' ? d.hint : '',
          welcomeTitle: typeof d.welcomeTitle === 'string' ? d.welcomeTitle : '',
          welcomeSubtitle: typeof d.welcomeSubtitle === 'string' ? d.welcomeSubtitle : '',
        };
      }
    } catch (err) {
      if (isQuotaError(err)) {
        markQuotaBlocked();
      } else {
        result.errors.push(
          'Gate read error: ' + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  }
  if (!gateToSave) {
    gateToSave = await getCachedGateConfig();
  }
  if (gateToSave && gateToSave.passwordHash && gateToSave.hint && gateToSave.welcomeTitle) {
    await saveGateToPostgres(gateToSave);
    result.gateTransferred = true;
  }

  // 2. Transfer Love Letter + bottom photo
  onProgress?.('Checking love letter & photo...');
  let letterToSave: LoveLetterData | null = null;
  let letterDocMissingInFirestore = false;
  if (!firestoreBlocked) {
    try {
      const snap = await getDoc(doc(db, 'letter', 'birthday'));
      if (snap.exists()) {
        const d = snap.data();
        letterToSave = {
          recipient: d.recipient || 'Tsi',
          notice: d.notice || '',
          salutation: d.salutation || 'Happy Birthday, My Sunshine ❤️',
          paragraphs: Array.isArray(d.paragraphs) ? d.paragraphs : [],
          closing: d.closing || 'With all my love,',
          signature: d.signature || 'Yours ❤️',
          anniversaryDate: d.anniversaryDate || 'On Your Special Birthday',
          bottomPhotoUrl: typeof d.bottomPhotoUrl === 'string' ? d.bottomPhotoUrl : '',
          bottomPhotoCaption:
            typeof d.bottomPhotoCaption === 'string' ? d.bottomPhotoCaption : '',
        };
      } else {
        letterDocMissingInFirestore = true;
      }
    } catch (err) {
      if (isQuotaError(err)) {
        markQuotaBlocked();
      } else {
        result.errors.push(
          'Letter read error: ' + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  }
  if (!letterToSave) {
    letterToSave = await getCachedLetter();
  }
  if (!letterToSave && letterDocMissingInFirestore && !status.counts.hasLetter) {
    letterToSave = DEFAULT_LOVE_LETTER;
  }
  if (letterToSave && letterToSave.paragraphs.length > 0) {
    await saveLetterToPostgres(letterToSave);
    result.letterTransferred = true;
  }

  // 3. Transfer Dedicated Song + cover photo
  onProgress?.('Checking Our Song & cover photo...');
  let songToSave: SongConfig | null = null;
  if (!firestoreBlocked) {
    try {
      const snap = await getDoc(doc(db, 'song', 'config'));
      if (snap.exists()) {
        const d = snap.data();
        songToSave = {
          songTitle: d.songTitle || 'All I Ever Need',
          artistName: d.artistName || 'Austin Mahone',
          youtubeUrl: d.youtubeUrl || 'https://www.youtube.com/watch?v=ZAC_k1HUyE4',
          dedicationHeading:
            d.dedicationHeading || 'A Song That Speaks What Words Cannot',
          dedicationBody: d.dedicationBody || '',
          lyricsText: d.lyricsText || '',
          meaning: typeof d.meaning === 'string' ? d.meaning : '',
          coverPhotoUrl: typeof d.coverPhotoUrl === 'string' ? d.coverPhotoUrl : '',
        };
      }
    } catch (err) {
      if (isQuotaError(err)) {
        markQuotaBlocked();
      } else {
        result.errors.push(
          'Song read error: ' + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  }
  if (!songToSave) {
    songToSave = await getCachedSongConfig();
  }
  if (songToSave && songToSave.youtubeUrl) {
    await saveSongToPostgres(songToSave);
    result.songTransferred = true;
  }

  // 4. Transfer cached browser memories first (zero Firestore reads!)
  const transferredIds = new Set<string>();
  const cachedList = await getCachedMemoriesList();
  if (cachedList && cachedList.length > 0) {
    result.memoriesTotalFound += cachedList.length;
    const baseMs = Date.now();
    for (let i = 0; i < cachedList.length; i++) {
      const item = cachedList[i];
      transferredIds.add(item.id);
      try {
        const ok = await uploadOneMemory(
          { ...item, sortOrder: baseMs - i * 1000 },
          i,
          cachedList.length
        );
        if (ok) result.memoriesTransferred++;
      } catch (err) {
        result.errors.push(
          `Cached item ${i + 1}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // 5. Stream live Firestore memories in small pages of 4 so partial progress always saves
  if (!firestoreBlocked) {
    onProgress?.('Reading photos & videos from Firebase...');
    try {
      let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      let pageNum = 0;
      let usedFallbackQuery = false;

      while (!firestoreBlocked) {
        const pageLimit = 4;
        let q: Query<DocumentData>;
        if (usedFallbackQuery) {
          q = lastDoc
            ? query(collection(db, 'memories'), startAfter(lastDoc), limit(pageLimit))
            : query(collection(db, 'memories'), limit(pageLimit));
        } else {
          q = lastDoc
            ? query(
                collection(db, 'memories'),
                orderBy('createdAt', 'desc'),
                startAfter(lastDoc),
                limit(pageLimit)
              )
            : query(
                collection(db, 'memories'),
                orderBy('createdAt', 'desc'),
                limit(pageLimit)
              );
        }

        const snapshot: QuerySnapshot<DocumentData> = await getDocs(q);
        if (snapshot.empty) {
          if (pageNum === 0 && !usedFallbackQuery) {
            usedFallbackQuery = true;
            continue;
          }
          break;
        }

        pageNum++;
        for (let idx = 0; idx < snapshot.docs.length; idx++) {
          const docSnap = snapshot.docs[idx];
          if (transferredIds.has(docSnap.id)) continue;
          transferredIds.add(docSnap.id);

          const data = docSnap.data();
          const mediaType: 'photo' | 'video' = data.type === 'video' ? 'video' : 'photo';
          const isChunked = Boolean(data.isChunked);
          const createdMs =
            data.createdAt && typeof data.createdAt.toMillis === 'function'
              ? Number(data.createdAt.toMillis())
              : Date.now() - result.memoriesTotalFound * 1000;

          const item: MemoryItem & { sortOrder?: number } = {
            id: docSnap.id,
            type: mediaType,
            url: typeof data.url === 'string' ? data.url : '',
            title: data.title || 'Tsi',
            caption: data.caption || '',
            date: data.date || '',
            tag: data.tag || '',
            aspectRatio: data.aspectRatio || (mediaType === 'video' ? '16:9' : '4:3'),
            isCustom: true,
            isChunked,
            sortOrder: createdMs,
          };

          result.memoriesTotalFound++;
          try {
            const ok = await uploadOneMemory(
              item,
              result.memoriesTotalFound - 1,
              result.memoriesTotalFound
            );
            if (ok) result.memoriesTransferred++;
          } catch (itemErr) {
            result.errors.push(
              `${item.type}: ${
                itemErr instanceof Error ? itemErr.message : String(itemErr)
              }`
            );
          }
        }

        if (snapshot.docs.length < pageLimit) break;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }
    } catch (err) {
      if (isQuotaError(err)) {
        markQuotaBlocked();
      } else {
        result.errors.push(
          'Firebase read error: ' + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  }

  invalidateDbStatusCache();
  return result;
}
