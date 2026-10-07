import { clearAllCache } from './indexeddb-cache'

// Clears every cache this app writes to, then reloads. Used by the "Clear
// cached data" button in Progress.tsx — not called automatically anywhere.
//
// Covers two separate stores because they're written by different layers:
// - IndexedDB (papyrus-cache, via indexeddb-cache.ts) holds the chunked
//   embedding index.
// - Cache Storage holds Transformers.js's model files (env.useBrowserCache
//   in worker-core.ts) and the service worker's precached app shell /
//   Workbox runtime caches.
export async function clearAllCachedData(): Promise<void> {
  await clearAllCache()
  const keys = await caches.keys()
  await Promise.all(keys.map(key => caches.delete(key)))
}
