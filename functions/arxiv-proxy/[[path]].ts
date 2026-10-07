// Only ever called by src/lib/arxiv-api.ts, same-origin, for exactly one
// purpose: look up metadata for a small batch of arXiv IDs the client
// already has from a search. Anything outside that shape (a different
// path, an arbitrary search_query, more IDs than a search ever returns) is
// rejected outright rather than forwarded, so this can't be turned into a
// general-purpose arXiv API relay.
const ARXIV_ID_RE = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})$/
const MAX_IDS = 20

export async function onRequest(context: {
  request: Request
  waitUntil: (p: Promise<unknown>) => void
}): Promise<Response> {
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } })
  }

  const url = new URL(context.request.url)
  if (url.pathname !== '/arxiv-proxy/query') {
    return new Response('Not Found', { status: 404 })
  }

  const allowedParams = new Set(['id_list', 'max_results'])
  for (const key of url.searchParams.keys()) {
    if (!allowedParams.has(key)) {
      return new Response(`Unsupported parameter: ${key}`, { status: 400 })
    }
  }

  const rawIds = (url.searchParams.get('id_list') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (rawIds.length === 0 || rawIds.length > MAX_IDS) {
    return new Response(`id_list must have 1-${MAX_IDS} ids`, { status: 400 })
  }
  if (!rawIds.every(id => ARXIV_ID_RE.test(id))) {
    return new Response('Invalid arXiv id in id_list', { status: 400 })
  }

  // Sorted + deduped ids both normalize the cache key and match upstream's
  // own behavior (order doesn't matter — arxiv-api.ts keys results by id).
  const ids = [...new Set(rawIds)].sort()
  const target = `https://export.arxiv.org/api/query?id_list=${ids.join(',')}&max_results=${ids.length}`

  const cache = caches.default
  const cacheKey = new Request(target, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const response = await fetch(target, {
    headers: { 'User-Agent': 'Papyrus/1.0' },
  })

  const body = await response.text()
  const result = new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/xml',
      ...(response.ok ? { 'Cache-Control': 'public, max-age=3600' } : {}),
    },
  })

  if (response.ok) {
    context.waitUntil(cache.put(cacheKey, result.clone()))
  }

  return result
}
