import { useState } from 'react'
import { useSearchStore } from '../stores/searchStore'

interface ResultsProps {
  onFindSimilar: (idx: number, title: string) => void
}

export function Results({ onFindSimilar }: ResultsProps) {
  const {
    results, stage, resultQuery, similarQuery, similarStack,
    isReranking, rerankerReady, paperDetails, detailsLoading,
  } = useSearchStore()
  const [copied, setCopied] = useState(false)
  const [copiedBibtex, setCopiedBibtex] = useState<string | null>(null)
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set())

  function toggleAbstract(arxivId: string) {
    setExpandedAbstracts(prev => {
      const next = new Set(prev)
      next.has(arxivId) ? next.delete(arxivId) : next.add(arxivId)
      return next
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function catClass(categories: string) {
    const primary = categories.split(' ')[0]
    if (primary.startsWith('cs.')) return 'cat-cs'
    if (primary.startsWith('math.')) return 'cat-math'
    if (/^(physics|hep-|astro-|cond-mat|quant-|gr-|nucl-)/.test(primary)) return 'cat-physics'
    if (primary.startsWith('stat.')) return 'cat-stat'
    if (primary.startsWith('eess.')) return 'cat-eess'
    if (primary.startsWith('q-bio.')) return 'cat-bio'
    if (primary.startsWith('q-fin.')) return 'cat-fin'
    return 'cat-other'
  }

  function copyBibtex(arxivId: string, title: string) {
    const detail = paperDetails[arxivId]
    if (!detail) return
    const firstAuthor = detail.authors[0]?.split(' ').pop() ?? 'unknown'
    const year = new Date(detail.published).getFullYear()
    const key = `${firstAuthor}${year}${arxivId.replace('.', '')}`
    const bibtex = `@article{${key},\n  title={${title}},\n  author={${detail.authors.join(' and ')}},\n  journal={arXiv preprint arXiv:${arxivId}},\n  year={${year}}\n}`
    navigator.clipboard.writeText(bibtex)
    setCopiedBibtex(arxivId)
    setTimeout(() => setCopiedBibtex(null), 2000)
  }

  if (stage === 'searching' && results.length === 0) {
    return <div className="results-container"><div className="loading-spinner" /></div>
  }

  if (stage === 'ready' && results.length === 0 && resultQuery) {
    return <div className="results-empty">No papers matched your filters.</div>
  }

  if (results.length === 0) return null

  return (
    <div className="results-container">
      <div className="results-header">
        {similarStack.length > 0 && similarQuery && (
          <button className="back-btn" onClick={() => useSearchStore.getState().goBack()}>
            ← Back
          </button>
        )}
        {similarQuery ? (
          <h2 className="results-title">Similar to: <em>{similarQuery}</em></h2>
        ) : (
          <>
            <h2 className="results-title">Results</h2>
            <span className="results-meta">{results.length} papers for "{resultQuery}"</span>
          </>
        )}
        <button className="copy-link-btn" onClick={copyLink}>
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        {isReranking && <span className="reranking-indicator">Reranking…</span>}
      </div>

      {!rerankerReady && results.length > 0 && (
        <div className="reranker-banner">
          Reranker loading — results sorted by embedding similarity only
        </div>
      )}

      {results.map((result) => {
        const detail = paperDetails[result.arxiv_id]
        return (
          <div key={result.arxiv_id} className={`result-card ${catClass(result.categories)}`}>
            <div className="rank">{result.rank}</div>
            <div className="result-content">
              <a
                href={`https://arxiv.org/abs/${result.arxiv_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="title"
              >
                {result.title}
              </a>
              <div className="meta">
                <span className="arxiv-id">{result.arxiv_id}</span>
                <span className="categories">{result.categories}</span>
                <span className="score">{result.score.toFixed(3)}</span>
              </div>

              {detail ? (
                <div className="result-abstract" onClick={() => toggleAbstract(result.arxiv_id)}>
                  <div className="result-authors">
                    {detail.authors.slice(0, 5).join(', ')}
                    {detail.authors.length > 5 && ' et al.'}
                  </div>
                  <p className={`abstract-text${expandedAbstracts.has(result.arxiv_id) ? ' expanded' : ''}`}>
                    {detail.abstract}
                  </p>
                  <span className="published-date">
                    {new Date(detail.published).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                  </span>
                </div>
              ) : detailsLoading ? (
                <div className="abstract-loading">Loading abstract…</div>
              ) : null}

              <div className="result-actions">
                <button
                  className="find-similar-btn"
                  onClick={() => onFindSimilar(result.idx, result.title)}
                >
                  Find Similar
                </button>
                {detail && (
                  <button
                    className="bibtex-btn"
                    onClick={() => copyBibtex(result.arxiv_id, result.title)}
                  >
                    {copiedBibtex === result.arxiv_id ? 'Copied!' : 'Copy BibTeX'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
