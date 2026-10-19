import { useEffect, useState } from 'react'
import { useMLWorker } from './hooks/useMLWorker'
import { useSearchStore } from './stores/searchStore'
import { useTheme } from './hooks/useTheme'
import { SearchBox } from './components/SearchBox'
import { Filters } from './components/Filters'
import { Progress } from './components/Progress'
import { Results } from './components/Results'
import { totalDownloadMB } from './lib/model-sizes'
import './App.css'

function App() {
  const { search, findSimilar, buildGraph } = useMLWorker()
  const filters = useSearchStore(s => s.filters)
  const { theme, toggleTheme } = useTheme()
  const [lowMemory, setLowMemory] = useState(() => {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
    return mem !== undefined && mem <= 2
  })

  // Re-run the current search or "similar to" view when filters change —
  // otherwise toggling a category pill after results are already showing
  // silently does nothing until the next manual search.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const { resultQuery, similarQuery, similarSeedIdx } = useSearchStore.getState()
      if (similarQuery && similarSeedIdx !== null) {
        findSimilar(similarSeedIdx, similarQuery, { refresh: true })
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
      <header>
        <h1>Papyrus</h1>
      </header>
      <main>
        <SearchBox onSearch={search} />
        <Filters />
        <Progress />
        <Results onFindSimilar={findSimilar} onBuildGraph={buildGraph} />
      </main>
    </div>
  )
}

export default App
