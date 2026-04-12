export async function onRequest(context: { request: Request }): Promise<Response> {
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
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
