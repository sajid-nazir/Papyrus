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

export async function clearCache(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getCacheSize(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).openCursor()
    let total = 0
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        total += (cursor.value as CacheEntry).data.byteLength
        cursor.continue()
      } else {
        resolve(total)
      }
    }
    req.onerror = () => reject(req.error)
  })
}
