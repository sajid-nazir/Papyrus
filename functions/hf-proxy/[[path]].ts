export async function onRequest(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url)
  const hfPath = url.pathname.replace('/hf-proxy', '')
  const target = `https://huggingface.co${hfPath}${url.search}`

  const response = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': context.request.headers.get('Accept') ?? '*/*',
    },
    redirect: 'follow',
  })

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD')

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}
