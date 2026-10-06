export async function onRequest(context: { request: Request }): Promise<Response> {
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } })
  }

  const url = new URL(context.request.url)
  const target = `https://export.arxiv.org/api${url.pathname.replace('/arxiv-proxy', '')}${url.search}`

  const response = await fetch(target, {
    headers: { 'User-Agent': 'Papyrus/1.0' },
  })

  const body = await response.text()

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/xml',
      // Same-origin only: the frontend calls this via a relative path, so no
      // cross-origin CORS grant is needed, and a wildcard would let any
      // third-party site use this Function (and arXiv's rate limit) for free.
      ...(response.ok ? { 'Cache-Control': 'public, max-age=3600' } : {}),
    },
  })
}
