// Pure functions pulled out of worker-core.ts so they can be unit tested
// without pulling in that file's module-level side effects (configuring
// @huggingface/transformers' env, referencing self.location, etc. — all of
// which run on import and don't belong in a test environment).

export interface Metadata {
  titles: string[]
  arxiv_ids: string[]
  categories: string[]
}

export interface Filters {
  categories: string[]
  yearRange: [number, number] | null
}

const POPCOUNT = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1]
}

export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    dist += POPCOUNT[a[i] ^ b[i]]
  }
  return dist
}

// Same math as hammingDistance, but reads directly out of a big backing
// array at a byte offset instead of requiring a pre-sliced Uint8Array —
// used in scanTopK's hot loop (and build-graph's) so it never has to call
// .subarray() (which allocates a new view object) once per paper, up to
// ~1M times per search.
export function hammingDistanceAt(query: Uint8Array, index: Uint8Array, offset: number, len: number): number {
  let dist = 0
  for (let i = 0; i < len; i++) {
    dist += POPCOUNT[query[i] ^ index[offset + i]]
  }
  return dist
}

// Scans every paper's binary vector against `query` and returns the k
// closest by Hamming distance, sorted ascending (ties broken by ascending
// idx, matching the original collect-everything-then-stable-sort
// behavior this replaces). Unlike a full collect+sort over up to ~1M
// candidates, this never allocates per-paper and never sorts more than a
// small set clustered around the k-th distance:
//   1. one pass computes every eligible paper's distance into a reused
//      Uint16Array scratch buffer (no objects, no subarray views)
//   2. a histogram over the small range of possible distances [0, dim]
//      finds the distance threshold T where the k-th closest paper falls
//   3. a second pass collects just the papers at or under T (usually
//      close to k of them, occasionally more because of ties at T) and
//      sorts only that small set
// Distances are small integers (0..dim, dim typically 384 or 512), which
// is what makes the histogram approach a win over a general-purpose sort.
export function scanTopK(
  query: Uint8Array,
  binaryIndex: Uint8Array,
  bytesPerPaper: number,
  numPapers: number,
  dim: number,
  k: number,
  distScratch: Uint16Array,
  isEligible: (i: number) => boolean
): Array<{ idx: number; dist: number }> {
  if (k <= 0 || numPapers <= 0) return []

  const SKIP = 0xffff // outside [0, dim] for any real model dimension in use

  for (let i = 0; i < numPapers; i++) {
    if (!isEligible(i)) {
      distScratch[i] = SKIP
      continue
    }
    distScratch[i] = hammingDistanceAt(query, binaryIndex, i * bytesPerPaper, bytesPerPaper)
  }

  const hist = new Uint32Array(dim + 1)
  for (let i = 0; i < numPapers; i++) {
    const d = distScratch[i]
    if (d !== SKIP) hist[d]++
  }

  let cumulative = 0
  let threshold = dim
  for (let d = 0; d <= dim; d++) {
    cumulative += hist[d]
    if (cumulative >= k) {
      threshold = d
      break
    }
  }

  const results: Array<{ idx: number; dist: number }> = []
  for (let i = 0; i < numPapers; i++) {
    const d = distScratch[i]
    if (d !== SKIP && d <= threshold) results.push({ idx: i, dist: d })
  }

  results.sort((a, b) => a.dist - b.dist || a.idx - b.idx)
  return results.length > k ? results.slice(0, k) : results
}

export function toUBinary(embedding: number[], dim: number): Uint8Array {
  const bytes = Math.ceil(dim / 8)
  const binary = new Uint8Array(bytes)
  for (let i = 0; i < dim; i++) {
    if (embedding[i] > 0) {
      binary[Math.floor(i / 8)] |= 1 << (7 - (i % 8))
    }
  }
  return binary
}

export function yearFromArxivId(id: string): number {
  const match = id.match(/^(\d{2})(\d{2})\./)
  if (match) {
    const yy = parseInt(match[1], 10)
    return yy >= 90 ? 1900 + yy : 2000 + yy
  }
  const oldMatch = id.match(/\/(\d{2})(\d{2})/)
  if (oldMatch) {
    const yy = parseInt(oldMatch[1], 10)
    return yy >= 90 ? 1900 + yy : 2000 + yy
  }
  return 0
}

export function passesFilters(
  metadata: Metadata,
  i: number,
  filters?: Filters
): boolean {
  if (!filters) return true
  if (filters.categories.length > 0) {
    const paperCats = metadata.categories[i].split(' ')
    if (!filters.categories.some(fc => paperCats.includes(fc))) return false
  }
  if (filters.yearRange) {
    const year = yearFromArxivId(metadata.arxiv_ids[i])
    if (year < filters.yearRange[0] || year > filters.yearRange[1]) return false
  }
  return true
}

// passesFilters above re-splits a category string and re-parses a year out
// of the arXiv id on every call — fine for the occasional one-off check,
// but a filtered search calls it once per paper, up to ~1M times. FilterIndex
// precomputes both once (at index-load time) into flat typed arrays, and
// passesFiltersFast below does the same OR-match / range-check logic
// against that instead of raw strings — same result, no per-paper parsing.
export interface FilterIndex {
  // Each paper's category ids live in catIds[catOffsets[i] .. catOffsets[i+1]),
  // a flat CSR-style layout instead of ~1M small per-paper arrays.
  catIds: Uint16Array
  catOffsets: Uint32Array
  years: Uint16Array
  catToId: Map<string, number>
}

export function buildFilterIndex(metadata: Metadata): FilterIndex {
  const numPapers = metadata.titles.length
  const catToId = new Map<string, number>()
  const paperCatIds: number[][] = new Array(numPapers)
  const years = new Uint16Array(numPapers)
  let totalRefs = 0

  for (let i = 0; i < numPapers; i++) {
    const cats = metadata.categories[i].split(' ')
    const ids: number[] = new Array(cats.length)
    for (let j = 0; j < cats.length; j++) {
      const c = cats[j]
      let id = catToId.get(c)
      if (id === undefined) {
        id = catToId.size
        catToId.set(c, id)
      }
      ids[j] = id
    }
    paperCatIds[i] = ids
    totalRefs += ids.length
    years[i] = yearFromArxivId(metadata.arxiv_ids[i])
  }

  const catIds = new Uint16Array(totalRefs)
  const catOffsets = new Uint32Array(numPapers + 1)
  let pos = 0
  for (let i = 0; i < numPapers; i++) {
    catOffsets[i] = pos
    const ids = paperCatIds[i]
    for (let j = 0; j < ids.length; j++) catIds[pos++] = ids[j]
  }
  catOffsets[numPapers] = pos

  return { catIds, catOffsets, years, catToId }
}

// Resolves the filter panel's selected category strings to their interned
// ids once per request — not once per paper. null means "no category
// filter", matching passesFilters' `filters.categories.length > 0` gate.
// A selected category with no matching id (shouldn't happen in practice —
// the filter options come from this same index — but handled defensively)
// just never matches any paper, same as it would with the string version.
export function selectedCategoryIds(index: FilterIndex, categories: string[]): Set<number> | null {
  if (categories.length === 0) return null
  const ids = new Set<number>()
  for (const c of categories) {
    const id = index.catToId.get(c)
    if (id !== undefined) ids.add(id)
  }
  return ids
}

export function passesFiltersFast(
  index: FilterIndex,
  i: number,
  selectedCatIds: Set<number> | null,
  yearRange: [number, number] | null
): boolean {
  if (selectedCatIds) {
    let match = false
    for (let j = index.catOffsets[i]; j < index.catOffsets[i + 1]; j++) {
      if (selectedCatIds.has(index.catIds[j])) {
        match = true
        break
      }
    }
    if (!match) return false
  }
  if (yearRange) {
    const year = index.years[i]
    if (year < yearRange[0] || year > yearRange[1]) return false
  }
  return true
}
