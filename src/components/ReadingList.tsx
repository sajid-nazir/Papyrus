import { useReadingListStore } from '../stores/readingListStore'
import { toBibtex, toRis, toCsv, downloadTextFile } from '../lib/export-formats'

export function ReadingList() {
  const { papers, removePaper, clearAll } = useReadingListStore()

  function exportAs(format: 'bibtex' | 'ris' | 'csv') {
    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'bibtex') {
      downloadTextFile(`papyrus-reading-list-${stamp}.bib`, toBibtex(papers), 'application/x-bibtex')
    } else if (format === 'ris') {
      downloadTextFile(`papyrus-reading-list-${stamp}.ris`, toRis(papers), 'application/x-research-info-systems')
    } else {
      downloadTextFile(`papyrus-reading-list-${stamp}.csv`, toCsv(papers), 'text/csv')
    }
  }

  return (
    <div className="reading-list">
      <div className="reading-list-header">
        <h2 className="results-title">Reading list ({papers.length})</h2>
        <div className="actions-right">
          {papers.length > 0 && (
            <>
              <button className="btn-sm" onClick={() => exportAs('bibtex')}>Export BibTeX</button>
              <button className="btn-sm" onClick={() => exportAs('ris')}>Export RIS</button>
              <button className="btn-sm" onClick={() => exportAs('csv')}>Export CSV</button>
              <button className="btn-sm" onClick={() => { if (window.confirm('Clear the whole reading list?')) clearAll() }}>
                Clear all
              </button>
            </>
          )}
        </div>
      </div>

      {papers.length === 0 ? (
        <div className="results-empty" role="status">
          Nothing saved yet — use the star on a result to add it here.
        </div>
      ) : (
        papers.map((paper) => (
          <div key={paper.key} className="result-card reading-list-card">
            <div className="result-content">
              <a href={paper.url} target="_blank" rel="noopener noreferrer" className="title">
                {paper.title}
              </a>
              {paper.authors.length > 0 && (
                <div className="result-authors">
                  {paper.authors.slice(0, 5).join(', ')}
                  {paper.authors.length > 5 && ' et al.'}
                </div>
              )}
              <div className="meta">
                {paper.year && <span>{paper.year}</span>}
                <span>{paper.source === 'arxiv' ? `arXiv:${paper.id}` : (paper.journal ?? 'Europe PMC')}</span>
              </div>
              <div className="result-actions">
                <button className="btn-sm" onClick={() => removePaper(paper.key)}>Remove</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
