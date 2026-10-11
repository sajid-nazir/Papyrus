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
