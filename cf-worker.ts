interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/hf-proxy/')) {
      const hfPath = url.pathname.replace('/hf-proxy', '')
      const target = `https://huggingface.co${hfPath}${url.search}`
      const response = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      })
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(response.body, { status: response.status, headers })
    }

    if (url.pathname.startsWith('/arxiv-proxy/')) {
      const arxivPath = url.pathname.replace('/arxiv-proxy', '')
      const target = `https://export.arxiv.org/api${arxivPath}${url.search}`
      const response = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } })
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

    return env.ASSETS.fetch(request)
  },
}
