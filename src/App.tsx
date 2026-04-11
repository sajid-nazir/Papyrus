import { useMLWorker } from './hooks/useMLWorker'
import { SearchBox } from './components/SearchBox'
import { Filters } from './components/Filters'
import { Progress } from './components/Progress'
import { Results } from './components/Results'
import './App.css'

function App() {
  const { search } = useMLWorker()

  return (
    <div className="app">
      <header>
        <h1>Papyrus</h1>
      </header>
      <main>
        <SearchBox onSearch={search} />
        <Filters />
        <Progress />
        <Results />
      </main>
    </div>
  )
}

export default App
