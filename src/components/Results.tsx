import { lazy, Suspense, useState } from 'react'
import { useSearchStore } from '../stores/searchStore'
import { catColor } from '../lib/categories'

const GraphView = lazy(() => import('./GraphView').then(m => ({ default: m.GraphView })))

interface ResultsProps {
  onFindSimilar: (idx: number, title: string) => void
  onBuildGraph: (seedIdxs: number[]) => void
}

export function Results({ onFindSimilar, onBuildGraph }: ResultsProps) {
  const {
    results, stage, resultQuery, similarQuery, similarStack,
    isReranking, resultsReranked, paperDetails, detailsLoading, detailsFailed,
    filters, resetFilters,
    graph, graphOpen, setGraphOpen,
  } = useSearchStore()
  const [copied, setCopied] = useState(false)
  const [copiedBibtex, setCopiedBibtex] = useState<string | null>(null)
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set())

  function toggleGraph() {
    const open = !graphOpen
    setGraphOpen(open)
    if (open) onBuildGraph(results.map(r => r.idx))
  }

  function toggleAbstract(arxivId: string) {
    setExpandedAbstracts(prev => {
      const next = new Set(prev)
      if (next.has(arxivId)) {
        next.delete(arxivId)
      } else {
        next.add(arxivId)
      }
      return next
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
    return (
      <div className="results-container">
        <div className="loading-spinner" role="status" aria-label="Searching" />
      </div>
    )
  }

  if (stage === 'ready' && results.length === 0 && resultQuery) {
    const hasActiveFilters = filters.categories.length > 0 || filters.yearRange !== null
    return (
      <div className="results-empty" role="status">
        {hasActiveFilters ? (
          <>
            No papers matched your filters.{' '}
            <button className="back-btn" onClick={resetFilters}>Reset filters</button>
          </>
        ) : (
          `No papers found for "${resultQuery}".`
        )}
      </div>
    )
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
          <h2 className="results-title">"{resultQuery}"</h2>
        )}
        <span className="results-meta" role="status" aria-live="polite">
          {isReranking ? 'Reranking…' : `${results.length} papers`}
        </span>
        <div className="actions-right">
          <button className="btn-sm" onClick={toggleGraph} aria-pressed={graphOpen}>
            {graphOpen ? 'Hide Graph' : 'Graph'}
          </button>
          <button className="btn-sm" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      {!resultsReranked && results.length > 0 && (
        <div className="reranker-banner" role="status">
          Fast results — refined ranking still loading. Search again in a moment for better ordering.
        </div>
      )}

      {graphOpen && (
        <Suspense fallback={<div className="graph-loading">Loading graph…</div>}>
          <GraphView
            graph={graph}
            onNodeClick={(idx, title) => onFindSimilar(idx, title)}
          />
        </Suspense>
      )}

      {results.map((result) => {
        const detail = paperDetails[result.arxiv_id]
        const expanded = expandedAbstracts.has(result.arxiv_id)
        return (
          <div
            key={result.arxiv_id}
            className="result-card"
            style={{ borderLeftColor: catColor(result.categories) }}
          >
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

              {detail && (
                <div className="result-authors">
                  {detail.authors.slice(0, 5).join(', ')}
                  {detail.authors.length > 5 && ' et al.'}
                </div>
              )}

              <div className="meta">
                {detail && (
                  <span>{new Date(detail.published).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</span>
                )}
                <span>{result.categories.split(' ').join(', ')}</span>
                <span>arXiv:{result.arxiv_id}</span>
              </div>

              {detail ? (
                <>
                  <p
                    className={`abstract-text${expanded ? ' expanded' : ''}`}
                    onClick={() => {
                      if (window.getSelection()?.toString()) return
                      toggleAbstract(result.arxiv_id)
                    }}
                  >
                    {detail.abstract}
                  </p>
                  <button className="abstract-toggle-btn" onClick={() => toggleAbstract(result.arxiv_id)}>
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                </>
              ) : detailsLoading ? (
                <div className="abstract-skeleton">
                  <div className="abstract-skeleton-line" style={{ width: '40%' }} />
                  <div className="abstract-skeleton-line" style={{ width: '100%' }} />
                  <div className="abstract-skeleton-line" style={{ width: '100%' }} />
                  <div className="abstract-skeleton-line" style={{ width: '60%' }} />
                </div>
              ) : detailsFailed ? (
                <div className="abstract-unavailable">
                  Abstract unavailable —{' '}
                  <a href={`https://arxiv.org/abs/${result.arxiv_id}`} target="_blank" rel="noopener noreferrer">
                    view on arXiv
                  </a>
                </div>
              ) : null}

              <div className="result-actions">
                <button
                  className="btn-sm"
                  onClick={() => onFindSimilar(result.idx, result.title)}
                >
                  Find Similar
                </button>
                {detail && (
                  <button
                    className="btn-sm"
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
