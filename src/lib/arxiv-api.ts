// NOTE: This module uses DOMParser and MUST run on the main thread, not in a Web Worker.

export interface ArxivPaperDetail {
  arxiv_id: string
  abstract: string
  authors: string[]
  published: string
}

// In dev: requests go through Vite proxy → export.arxiv.org (bypasses CORS)
// In prod: requests go through /arxiv-proxy Cloudflare Pages Function (Phase 5)
const API_BASE = '/arxiv-proxy/query'
const RATE_LIMIT_MS = 3000

let lastRequestTime = 0

export async function fetchArxivDetails(
  arxivIds: string[],
  signal?: AbortSignal
): Promise<Map<string, ArxivPaperDetail>> {
  const now = Date.now()
  const wait = RATE_LIMIT_MS - (now - lastRequestTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestTime = Date.now()

  const url = `${API_BASE}?id_list=${arxivIds.join(',')}&max_results=${arxivIds.length}`

  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    await new Promise(r => setTimeout(r, 2000))
    response = await fetch(url, { signal })
  }

  if (!response.ok) {
    if (response.status === 503) {
      await new Promise(r => setTimeout(r, 3000))
      response = await fetch(url, { signal })
    }
    if (!response.ok) {
      console.warn(`[arxiv-api] Non-OK response: ${response.status}`)
      return new Map()
    }
  }

  const xml = await response.text()
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const results = new Map<string, ArxivPaperDetail>()

  doc.querySelectorAll('entry').forEach(entry => {
    const rawId = entry.querySelector('id')?.textContent ?? ''
    const cleanId = rawId
      .replace('http://arxiv.org/abs/', '')
      .replace('https://arxiv.org/abs/', '')
      .replace(/v\d+$/, '')
    const abstract = entry.querySelector('summary')?.textContent?.trim() ?? ''
    const published = entry.querySelector('published')?.textContent ?? ''
    const authors = Array.from(entry.querySelectorAll('author name'))
      .map(n => n.textContent ?? '')
      .filter(Boolean)
    results.set(cleanId, { arxiv_id: cleanId, abstract, authors, published })
  })

  return results
}
