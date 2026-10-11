import { useState, useCallback, type FocusEvent, type KeyboardEvent } from 'react'
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
      if (e.key === 'Escape') setShowHistory(false)
    },
    [handleSearch]
  )

  // Closes the dropdown only when focus leaves the whole search box, not on
  // every blur of the input — otherwise Tabbing from the input to the
  // Search button (or to a history item) would close it before it could be
  // reached, since onBlur fires before the browser finishes moving focus.
  function handleContainerBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setShowHistory(false)
    }
  }

  return (
    <div className="search-box" onBlur={handleContainerBlur}>
      <div className="search-row">
        <input
          type="text"
          aria-label="Search papers"
          role="combobox"
          aria-expanded={showHistory && searchHistory.length > 0}
          aria-controls="search-history-list"
          aria-autocomplete="list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
          placeholder={modelsLoaded ? 'Search papers…' : 'Loading models…'}
          disabled={!modelsLoaded}
        />
        <button onClick={handleSearch} disabled={!isReady || isSearching}>
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {showHistory && searchHistory.length > 0 && (
        <ul className="search-history" id="search-history-list" role="listbox" aria-label="Recent searches">
          {searchHistory.map((h) => (
            <li key={h} role="option" aria-selected="false">
              <button
                type="button"
                onClick={() => { setQuery(h); setShowHistory(false); if (isReady) onSearch(h) }}
              >
                {h}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
