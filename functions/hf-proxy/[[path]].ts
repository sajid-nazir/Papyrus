// Only ever called by Transformers.js (via env.remoteHost in worker-core.ts),
// same-origin, to fetch files for exactly the models this app uses. Anything
// else is rejected so this can't be used as an open bandwidth proxy for
// arbitrary (often multi-GB) Hugging Face repos.
// Keep in sync with the modelId in src/worker.ts / worker-nomic.ts /
// worker-minilm.ts and Reranker.MODEL_ID in src/worker-core.ts.
const ALLOWED_REPOS = new Set([
  'Xenova/all-MiniLM-L6-v2',
  'nomic-ai/nomic-embed-text-v1.5',
  'mixedbread-ai/mxbai-embed-2d-large-v1',
  'Xenova/ms-marco-MiniLM-L-6-v2',
])

function repoFromPath(pathname: string): string | null {
  // pathname is like /hf-proxy/<owner>/<repo>/resolve/main/<file...>
  const parts = pathname.replace(/^\/hf-proxy\//, '').split('/')
  if (parts.length < 4 || parts[2] !== 'resolve') return null
  return `${parts[0]}/${parts[1]}`
}

export async function onRequest(context: { request: Request }): Promise<Response> {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const url = new URL(context.request.url)
  const repo = repoFromPath(url.pathname)
  if (!repo || !ALLOWED_REPOS.has(repo)) {
    return new Response('Not Found', { status: 404 })
  }

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
  headers.delete('Access-Control-Allow-Origin')
  if (response.ok) {
    // Fetched from the mutable "main" ref (no pinned revision), so cache
    // briefly rather than treating these as immutable content-addressed blobs.
    headers.set('Cache-Control', 'public, max-age=86400')
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}
