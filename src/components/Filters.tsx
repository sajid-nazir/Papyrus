import { useSearchStore } from '../stores/searchStore'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1990 }, (_, i) => CURRENT_YEAR - i)

export function Filters() {
  const {
    filters, availableCategories, setFilters, resetFilters,
    externalSearchEnabled, setExternalSearchEnabled,
  } = useSearchStore()

  if (availableCategories.length === 0) return null

  const topCategories = availableCategories.slice(0, 15)
  const hasActiveFilters = filters.categories.length > 0 || filters.yearRange !== null

  function toggleCategory(cat: string) {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat]
    setFilters({ ...filters, categories: next })
  }

  function setFromYear(value: string) {
    const to = filters.yearRange?.[1] ?? null
    if (value === '') {
      setFilters({ ...filters, yearRange: to === null ? null : [1991, to] })
      return
    }
    const year = Number(value)
    setFilters({ ...filters, yearRange: [year, Math.max(year, to ?? CURRENT_YEAR)] })
  }

  function setToYear(value: string) {
    const from = filters.yearRange?.[0] ?? null
    if (value === '') {
      setFilters({ ...filters, yearRange: from === null ? null : [from, CURRENT_YEAR] })
      return
    }
    const year = Number(value)
    setFilters({ ...filters, yearRange: [Math.min(from ?? 1991, year), year] })
  }

  return (
    <div className="filters-bar" role="group" aria-label="Search filters">
      <div className="filters-section">
        <span className="filters-label" id="category-filter-label">Category</span>
        <div className="category-pills" role="group" aria-labelledby="category-filter-label">
          {topCategories.map(({ category }) => (
            <button
              key={category}
              className={`category-pill${filters.categories.includes(category) ? ' active' : ''}`}
              aria-pressed={filters.categories.includes(category)}
              onClick={() => toggleCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="filters-section year-range">
        <label className="filters-label" htmlFor="year-from-select">Year</label>
        <select
          id="year-from-select"
          className="year-select"
          aria-label="From year"
          value={filters.yearRange?.[0] ?? ''}
          onChange={(e) => setFromYear(e.target.value)}
        >
          <option value="">From</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="filters-label" aria-hidden="true">—</span>
        <select
          id="year-to-select"
          className="year-select"
          aria-label="To year"
          value={filters.yearRange?.[1] ?? ''}
          onChange={(e) => setToYear(e.target.value)}
        >
          <option value="">To</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="filters-section external-search-toggle">
        <label className="external-search-label">
          <input
            type="checkbox"
            checked={externalSearchEnabled}
            onChange={(e) => setExternalSearchEnabled(e.target.checked)}
          />
          Also search Europe PMC
        </label>
        {externalSearchEnabled && (
          <span className="filters-label">— your search text is sent to europepmc.org when this is on</span>
        )}
      </div>

      {hasActiveFilters && (
        <button className="filters-reset" onClick={resetFilters}>
          Reset
        </button>
      )}
    </div>
  )
}
