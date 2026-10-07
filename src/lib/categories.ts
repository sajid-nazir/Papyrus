// Shared with the result-card border colors in App.css (.result-card.cat-*) —
// keep both in sync if either changes.
const CATEGORY_COLORS: Record<string, string> = {
  'cat-cs': '#4A6B8A',
  'cat-math': '#8B5E3C',
  'cat-physics': '#6B4C8A',
  'cat-stat': '#4A7C59',
  'cat-eess': '#8A6B4A',
  'cat-bio': '#3C7C7C',
  'cat-fin': '#7C5A3C',
  'cat-other': '#999999',
}

export function catClass(categories: string): string {
  const primary = categories.split(' ')[0]
  if (primary.startsWith('cs.')) return 'cat-cs'
  if (primary.startsWith('math.')) return 'cat-math'
  if (/^(physics|hep-|astro-|cond-mat|quant-|gr-|nucl-)/.test(primary)) return 'cat-physics'
  if (primary.startsWith('stat.')) return 'cat-stat'
  if (primary.startsWith('eess.')) return 'cat-eess'
  if (primary.startsWith('q-bio.')) return 'cat-bio'
  if (primary.startsWith('q-fin.')) return 'cat-fin'
  return 'cat-other'
}

export function catColor(categories: string): string {
  return CATEGORY_COLORS[catClass(categories)]
}
