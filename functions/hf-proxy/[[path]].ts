export async function onRequest(context: { request: Request }): Promise<Response> {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const url = new URL(context.request.url)
  const hfPath = url.pathname.replace('/hf-proxy', '')
  const target = `https://huggingface.co${hfPath}${url.search}`

  const response = await fetch(target, {
    method: context.request.method,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': context.request.headers.get('Accept') ?? '*/*',
    },
    redirect: 'follow',
  })

  const headers = new Headers(response.headers)
  // Same-origin only (see arxiv-proxy) — no CORS grant needed or wanted here.
  headers.delete('Access-Control-Allow-Origin')
  if (response.ok) {
    // Models are fetched from the "main" ref (no pinned revision), so they
    // can change upstream — cache at the edge to cut repeat multi-hundred-MB
    // downloads, but revalidate periodically rather than treating as immutable.
    headers.set('Cache-Control', 'public, max-age=86400')
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}
