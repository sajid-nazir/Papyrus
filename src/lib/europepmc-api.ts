import type { ExternalResult } from '../types'

// Europe PMC's REST API sends its own CORS headers (confirmed: a
// cross-origin GET gets `Access-Control-Allow-Origin: *`), so this is
// called directly from the browser — no Cloudflare proxy needed, unlike
// arxiv-proxy/hf-proxy which exist only to work around arXiv/HF not
// doing that. No API key or rate limit is imposed, unlike OpenAlex.
const API_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'

interface EuropePmcAuthor {
  fullName: string
}

interface EuropePmcResult {
  id: string
  source: string
  doi?: string
  title: string
  authorList?: { author: EuropePmcAuthor[] }
  journalInfo?: { journal?: { title?: string } }
  pubYear?: string
  abstractText?: string
}

interface EuropePmcResponse {
  resultList: { result: EuropePmcResult[] }
}

export async function searchEuropePmc(
  query: string,
  limit = 10,
  signal?: AbortSignal
): Promise<ExternalResult[]> {
  const url = `${API_BASE}?query=${encodeURIComponent(query)}&format=json&pageSize=${limit}&resultType=core`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    console.warn(`[europepmc-api] Non-OK response: ${response.status}`)
    return []
  }

  const data = await response.json() as EuropePmcResponse
  const results = data.resultList?.result ?? []

  return results.map((r): ExternalResult => ({
    source: 'europepmc',
    id: r.id,
    // EPMC titles often end in a trailing period arXiv's don't, and
    // abstractText regularly contains embedded markup (<title>, <p>, <b>,
    // <i>) that isn't safe or useful to render as HTML here.
    title: r.title.replace(/\.$/, ''),
    authors: r.authorList?.author.map(a => a.fullName) ?? [],
    abstract: (r.abstractText ?? '').replace(/<[^>]+>/g, '').trim(),
    journal: r.journalInfo?.journal?.title ?? null,
    year: r.pubYear ? parseInt(r.pubYear, 10) : null,
    url: `https://europepmc.org/article/${r.source}/${r.id}`,
    doi: r.doi ?? null,
  }))
}
