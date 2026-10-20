import { useEffect, useState } from 'react'
import { useMLWorker } from './hooks/useMLWorker'
import { useSearchStore } from './stores/searchStore'
import { useReadingListStore } from './stores/readingListStore'
import { useTheme } from './hooks/useTheme'
import { SearchBox } from './components/SearchBox'
import { Filters } from './components/Filters'
import { Progress } from './components/Progress'
import { Results } from './components/Results'
import { ReadingList } from './components/ReadingList'
import { totalDownloadMB } from './lib/model-sizes'
import { parseArxivId } from './lib/parse-arxiv-id'
import './App.css'

function App() {
  const { search, findSimilar, findById, buildGraph } = useMLWorker()
  const filters = useSearchStore(s => s.filters)
  const savedCount = useReadingListStore(s => s.papers.length)
  const { theme, toggleTheme } = useTheme()
  const [lowMemory, setLowMemory] = useState(() => {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
    return mem !== undefined && mem <= 2
  })
  const [readingListOpen, setReadingListOpen] = useState(false)

  // Re-run the current search or "similar to" view when filters change —
  // otherwise toggling a category pill after results are already showing
  // silently does nothing until the next manual search.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const { resultQuery, similarQuery, similarSeedIdx } = useSearchStore.getState()
      const idQuery = parseArxivId(resultQuery)
      if (similarQuery && similarSeedIdx !== null) {
        findSimilar(similarSeedIdx, similarQuery, { refresh: true })
      } else if (idQuery) {
        findById(idQuery)
      } else if (resultQuery) {
        search(resultQuery)
      }
    }, 250)
    return () => clearTimeout(timeout)
    // Only filters should trigger this — resultQuery/similarQuery changing
    // on their own (a fresh search) must not re-trigger via this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  return (
    <div className="app">
      <button
        className="theme-toggle-btn"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      {lowMemory && (
        <div className="memory-warning">
          This app loads ~{totalDownloadMB()} MB of data and ML models. Performance may be limited on this device.
          <button aria-label="Dismiss" onClick={() => setLowMemory(false)}>✕</button>
        </div>
      )}
      <header className="app-header">
        <h1>Papyrus</h1>
        <button className="btn-sm" onClick={() => setReadingListOpen(v => !v)} aria-pressed={readingListOpen}>
          {readingListOpen ? 'Back to search' : `Reading list${savedCount > 0 ? ` (${savedCount})` : ''}`}
        </button>
      </header>
      <main>
        {readingListOpen ? (
          <ReadingList />
        ) : (
          <>
            <SearchBox onSearch={search} onFindById={findById} />
            <Filters />
            <Progress />
            <Results onFindSimilar={findSimilar} onBuildGraph={buildGraph} />
          </>
        )}
      </main>
    </div>
  )
}

export default App
