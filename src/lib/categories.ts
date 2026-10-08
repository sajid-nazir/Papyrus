// Single source of truth for category colors — result cards apply this via
// inline style (borderLeftColor) rather than per-category CSS classes, so
// there's nowhere else for this to drift out of sync. Picked for ~3.5-4.8:1
// contrast against both the light (#fff) and dark (#111) backgrounds, and
// to separate math/eess/fin, which were near-identical browns before.
const CATEGORY_COLORS: Record<string, string> = {
  'cat-cs': '#4A7AB0',
  'cat-math': '#B0703A',
  'cat-physics': '#8A63B8',
  'cat-stat': '#4C8A5C',
  'cat-eess': '#9A8A2E',
  'cat-bio': '#3A8A8A',
  'cat-fin': '#B0566E',
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

const CATEGORY_SHORT_NAMES: Record<string, string> = {
  'cat-cs': 'CS',
  'cat-math': 'Math',
  'cat-physics': 'Physics',
  'cat-stat': 'Stat',
  'cat-eess': 'EESS',
  'cat-bio': 'Bio',
  'cat-fin': 'Fin',
  'cat-other': 'Other',
}

export function catShortName(categories: string): string {
  return CATEGORY_SHORT_NAMES[catClass(categories)]
}
