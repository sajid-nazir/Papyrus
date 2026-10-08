import { useSearchStore } from '../stores/searchStore'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1990 }, (_, i) => CURRENT_YEAR - i)

export function Filters() {
  const { filters, availableCategories, setFilters, resetFilters } = useSearchStore()

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
    <div className="filters-bar">
      <div className="filters-section">
        <span className="filters-label">Category</span>
        <div className="category-pills">
          {topCategories.map(({ category }) => (
            <button
              key={category}
              className={`category-pill${filters.categories.includes(category) ? ' active' : ''}`}
              onClick={() => toggleCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="filters-section year-range">
        <span className="filters-label">Year</span>
        <select
          className="year-select"
          value={filters.yearRange?.[0] ?? ''}
          onChange={(e) => setFromYear(e.target.value)}
        >
          <option value="">From</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="filters-label">—</span>
        <select
          className="year-select"
          value={filters.yearRange?.[1] ?? ''}
          onChange={(e) => setToYear(e.target.value)}
        >
          <option value="">To</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <button className="filters-reset" onClick={resetFilters}>
          Reset
        </button>
      )}
    </div>
  )
}
