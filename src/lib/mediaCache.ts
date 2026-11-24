import { AccessGateConfig, LoveLetterData, MemoryItem } from '../types';

const DB_NAME = 'tsi_birthday_cache_v1';
const DB_VERSION = 1;
const MEDIA_STORE = 'media_blobs';
const META_STORE = 'metadata';

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function openCacheDb(): Promise<IDBDatabase> {
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      cachedDbPromise = null;
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        cachedDbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        cachedDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error || new Error('IndexedDB error'));
    };
  });

  return cachedDbPromise;
}

export async function getCachedMediaBlob(memoryId: string): Promise<Blob | null> {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_STORE).get(memoryId);
      req.onsuccess = () => {
        resolve(req.result instanceof Blob ? req.result : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedMediaBlob(memoryId: string, blob: Blob): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).put(blob, memoryId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore storage quota / private mode issues
  }
}

export async function deleteCachedMediaBlob(memoryId: string): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).delete(memoryId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore
  }
}

export async function getCachedMemoriesList(): Promise<MemoryItem[] | null> {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get('memories_list');
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? (req.result as MemoryItem[]) : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedMemoriesList(items: MemoryItem[]): Promise<void> {
  try {
    // Store metadata without volatile blob: URLs (cached blobs live in MEDIA_STORE)
    const serializable = items.map((item) => ({
      ...item,
      url: item.url.startsWith('blob:') ? '' : item.url,
    }));
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(serializable, 'memories_list');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore
  }
}

export async function getCachedLetter(): Promise<LoveLetterData | null> {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get('love_letter');
      req.onsuccess = () => {
        resolve(req.result ? (req.result as LoveLetterData) : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedLetter(letter: LoveLetterData): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(letter, 'love_letter');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore
  }
}

export async function getCachedGateConfig(): Promise<AccessGateConfig | null> {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get('access_gate');
      req.onsuccess = () => {
        resolve(req.result ? (req.result as AccessGateConfig) : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedGateConfig(config: AccessGateConfig): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(config, 'access_gate');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore
  }
}
