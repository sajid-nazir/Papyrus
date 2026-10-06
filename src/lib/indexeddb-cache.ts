const DB_NAME = 'papyrus-cache'
const DB_VERSION = 1
const STORE_NAME = 'blobs'

interface CacheEntry {
  key: string
  data: Uint8Array
  version: string
  timestamp: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCached(key: string, version: string): Promise<Uint8Array | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => {
      const entry = req.result as CacheEntry | undefined
      if (!entry || entry.version !== version) {
        resolve(null)
      } else {
        resolve(entry.data)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

export async function setCache(key: string, data: Uint8Array, version: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const entry: CacheEntry = { key, data, version, timestamp: Date.now() }
    const req = tx.objectStore(STORE_NAME).put(entry)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function clearCacheEntry(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// Deletes every cached entry whose key does NOT start with `keepPrefix`.
// Used to evict a previous model's cached data files when a different
// model is loaded, since each model's dataset lives under its own path
// prefix but all share this one IndexedDB store — without this, switching
// between the 512d/nomic/minilm models accumulates every model's data
// (hundreds of MB each) with nothing ever reclaiming it.
export async function clearCacheExceptPrefix(keepPrefix: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        const entry = cursor.value as CacheEntry
        if (!entry.key.startsWith(keepPrefix)) {
          cursor.delete()
        }
        cursor.continue()
      } else {
        resolve()
      }
    }
    req.onerror = () => reject(req.error)
  })
}
