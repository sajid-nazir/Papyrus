import { lazy, Suspense, useState, useEffect } from 'react'
import { useSearchStore } from '../stores/searchStore'
import { catColor } from '../lib/categories'
import { fetchArxivDetails } from '../lib/arxiv-api'
import type { ExternalResult, PaperDetail } from '../types'

const GraphView = lazy(() => import('./GraphView').then(m => ({ default: m.GraphView })))

const RESULTS_PAGE_SIZE = 10

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

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
    externalSearchEnabled, externalResults, externalSearchLoading,
    setPaperDetails, setDetailsLoading,
  } = useSearchStore()
  const [copied, setCopied] = useState(false)
  const [copiedBibtex, setCopiedBibtex] = useState<string | null>(null)
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE)

  // A new search or a new "find similar" view should start back at the
  // first page — but the same view's results array also gets replaced once
  // (fast hamming results → reranked results), and that replacement must
  // NOT reset the page the user is looking at. resultQuery/similarQuery
  // only change on an actual new view, not on that second replacement.
  // Adjusted during render (React's blessed pattern for this, not an
  // effect) so there's no extra render pass.
  const viewKey = `${resultQuery}\u0000${similarQuery ?? ''}`
  const [prevViewKey, setPrevViewKey] = useState(viewKey)
  if (viewKey !== prevViewKey) {
    setPrevViewKey(viewKey)
    setVisibleCount(RESULTS_PAGE_SIZE)
  }

  const visibleResults = results.slice(0, visibleCount)

  // The first page's abstracts are fetched by useMLWorker as soon as
  // results arrive; this only tops up abstracts for pages revealed via
  // "Load more" that aren't covered by that initial fetch yet.
  useEffect(() => {
    if (visibleCount <= RESULTS_PAGE_SIZE) return
    const idsNeeded = visibleResults
      .map(r => r.arxiv_id)
      .filter(id => !paperDetails[id])
    if (idsNeeded.length === 0) return

    const controller = new AbortController()
    setDetailsLoading(true)
    fetchArxivDetails(idsNeeded, controller.signal).then(detailsMap => {
      if (controller.signal.aborted) return
      const details: Record<string, PaperDetail> = {}
      detailsMap.forEach((v, k) => {
        details[k] = { abstract: v.abstract, authors: v.authors, published: v.published }
      })
      setPaperDetails(details)
      setDetailsLoading(false)
    }).catch((e) => {
      if ((e as Error).name !== 'AbortError') setDetailsLoading(false)
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, results])

  function toggleGraph() {
    const open = !graphOpen
    setGraphOpen(open)
    if (open) onBuildGraph(visibleResults.map(r => r.idx))
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

  function copyBibtexExternal(result: ExternalResult) {
    const firstAuthor = result.authors[0]?.split(' ').pop() ?? 'unknown'
    const year = result.year ?? new Date().getFullYear()
    const key = `${firstAuthor}${year}${result.id.replace(/[^a-zA-Z0-9]/g, '')}`
    const bibtex = result.doi
      ? `@article{${key},\n  title={${result.title}},\n  author={${result.authors.join(' and ')}},\n  journal={${result.journal ?? 'Europe PMC'}},\n  year={${year}},\n  doi={${result.doi}}\n}`
      : `@article{${key},\n  title={${result.title}},\n  author={${result.authors.join(' and ')}},\n  journal={${result.journal ?? 'Europe PMC'}},\n  year={${year}}\n}`
    navigator.clipboard.writeText(bibtex)
    setCopiedBibtex(result.id)
    setTimeout(() => setCopiedBibtex(null), 2000)
  }

  // Many preprints are cross-indexed in both arXiv and Europe PMC — drop
  // anything that's clearly the same paper we're already showing.
  const arxivTitles = new Set(results.map(r => normalizeTitle(r.title)))
  const dedupedExternalResults = externalResults.filter(r => !arxivTitles.has(normalizeTitle(r.title)))

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
          {isReranking
            ? 'Reranking…'
            : visibleCount < results.length
              ? `Showing ${visibleCount} of ${results.length} papers`
              : `${results.length} papers`}
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

      {visibleResults.map((result) => {
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

      {visibleCount < results.length && (
        <div className="load-more-row">
          <button
            className="btn-sm"
            onClick={() => setVisibleCount(c => Math.min(c + RESULTS_PAGE_SIZE, results.length))}
          >
            Load {Math.min(RESULTS_PAGE_SIZE, results.length - visibleCount)} more
          </button>
        </div>
      )}

      {externalSearchEnabled && (externalSearchLoading || dedupedExternalResults.length > 0) && (
        <div className="external-results">
          <h3 className="external-results-title">Other sources</h3>
          {externalSearchLoading && dedupedExternalResults.length === 0 ? (
            <div className="abstract-loading" role="status">Searching Europe PMC…</div>
          ) : (
            dedupedExternalResults.map((result) => {
              const expanded = expandedAbstracts.has(result.id)
              return (
                <div key={result.id} className="result-card external-result-card">
                  <div className="result-content">
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="title">
                      {result.title}
                    </a>

                    {result.authors.length > 0 && (
                      <div className="result-authors">
                        {result.authors.slice(0, 5).join(', ')}
                        {result.authors.length > 5 && ' et al.'}
                      </div>
                    )}

                    <div className="meta">
                      {result.year && <span>{result.year}</span>}
                      {result.journal && <span>{result.journal}</span>}
                      <span>Europe PMC</span>
                    </div>

                    {result.abstract && (
                      <>
                        <p
                          className={`abstract-text${expanded ? ' expanded' : ''}`}
                          onClick={() => {
                            if (window.getSelection()?.toString()) return
                            toggleAbstract(result.id)
                          }}
                        >
                          {result.abstract}
                        </p>
                        <button className="abstract-toggle-btn" onClick={() => toggleAbstract(result.id)}>
                          {expanded ? 'Show less' : 'Show more'}
                        </button>
                      </>
                    )}

                    <div className="result-actions">
                      <button className="btn-sm" onClick={() => copyBibtexExternal(result)}>
                        {copiedBibtex === result.id ? 'Copied!' : 'Copy BibTeX'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
