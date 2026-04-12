import { useState, useEffect } from 'react'
import { useMLWorker } from './hooks/useMLWorker'
import { SearchBox } from './components/SearchBox'
import { Filters } from './components/Filters'
import { Progress } from './components/Progress'
import { Results } from './components/Results'
import './App.css'

function App() {
  const { search, findSimilar } = useMLWorker()
  const [lowMemory, setLowMemory] = useState(false)

  useEffect(() => {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
    if (mem !== undefined && mem <= 2) setLowMemory(true)
  }, [])

  return (
    <div className="app">
      {lowMemory && (
        <div className="memory-warning">
          This app loads ~300 MB of data and ML models. Performance may be limited on this device.
          <button onClick={() => setLowMemory(false)}>✕</button>
        </div>
      )}
      <header>
        <h1>Papyrus</h1>
      </header>
      <main>
        <SearchBox onSearch={search} />
        <Filters />
        <Progress />
        <Results onFindSimilar={findSimilar} />
      </main>
    </div>
  )
}

export default App
