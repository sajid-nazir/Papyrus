import { useState, useCallback, type KeyboardEvent } from 'react'
import { useSearchStore } from '../stores/searchStore'

interface SearchBoxProps {
  onSearch: (query: string) => void
}

export function SearchBox({ onSearch }: SearchBoxProps) {
  const { query, setQuery, modelsLoaded, stage } = useSearchStore()
  const [showHistory, setShowHistory] = useState(false)
  const { searchHistory } = useSearchStore()

  const isReady = modelsLoaded && stage === 'ready'
  const isSearching = stage === 'searching'

  const handleSearch = useCallback(() => {
    if (!query.trim() || !isReady) return
    onSearch(query.trim())
    setShowHistory(false)
  }, [query, isReady, onSearch])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSearch()
    },
    [handleSearch]
  )

  return (
    <div className="search-box">
      <div className="search-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
          onBlur={() => setTimeout(() => setShowHistory(false), 200)}
          placeholder="Search papers..."
          disabled={!modelsLoaded}
        />
        <button onClick={handleSearch} disabled={!isReady || isSearching}>
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {showHistory && searchHistory.length > 0 && (
        <ul className="search-history">
          {searchHistory.map((h, i) => (
            <li key={i} onMouseDown={() => { setQuery(h); setShowHistory(false); if (isReady) onSearch(h) }}>
              {h}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
