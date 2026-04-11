import { useSearchStore } from '../stores/searchStore'

interface ResultsProps {
  onFindSimilar: (idx: number, title: string) => void
}

export function Results({ onFindSimilar }: ResultsProps) {
  const { results, stage, query, similarQuery, isReranking, rerankerReady } = useSearchStore()

  if (stage === 'searching' && results.length === 0) {
    return <div className="results-container"><div className="loading-spinner" /></div>
  }

  if (results.length === 0) return null

  return (
    <div className="results-container">
      <div className="results-header">
        {similarQuery ? (
          <>
            <h2 className="results-title">Similar to: <em>{similarQuery}</em></h2>
            <button className="back-btn" onClick={() => useSearchStore.getState().setSimilarQuery(null)}>
              ← Back
            </button>
          </>
        ) : (
          <>
            <h2 className="results-title">Results</h2>
            <span className="results-meta">{results.length} papers for "{query}"</span>
          </>
        )}
        {isReranking && <span className="reranking-indicator">Reranking…</span>}
      </div>

      {!rerankerReady && results.length > 0 && (
        <div className="reranker-banner">
          Reranker loading — results sorted by embedding similarity only
        </div>
      )}
      {results.map((result) => (
        <div key={result.arxiv_id} className="result-card">
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
            <div className="result-actions">
              <button
                className="find-similar-btn"
                onClick={() => onFindSimilar(result.idx, result.title)}
              >
                Find Similar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
