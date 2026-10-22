import { describe, it, expect } from 'vitest'
import { hammingDistance, toUBinary, yearFromArxivId, passesFilters, scanTopK, type Metadata } from './binary-search-utils'

describe('hammingDistance', () => {
  it('is 0 for identical arrays', () => {
    const a = new Uint8Array([0b10110010, 0b00001111])
    expect(hammingDistance(a, a)).toBe(0)
  })

  it('counts differing bits across all bytes', () => {
    const a = new Uint8Array([0b00000000, 0b11111111])
    const b = new Uint8Array([0b11111111, 0b11111111])
    expect(hammingDistance(a, b)).toBe(8) // only the first byte differs, in all 8 bits
  })

  it('counts a single flipped bit', () => {
    const a = new Uint8Array([0b00000001])
    const b = new Uint8Array([0b00000000])
    expect(hammingDistance(a, b)).toBe(1)
  })
})

describe('toUBinary', () => {
  it('sets a bit when the embedding value is positive, clears it otherwise', () => {
    // 8 dims so it packs into exactly one byte: bit 7 (MSB) is dim 0.
    const embedding = [1, -1, 0, 0.5, -0.5, 2, -2, 0.001]
    const binary = toUBinary(embedding, 8)
    // dim i>0 -> bit set; dim <=0 -> bit clear. Expected bits (MSB first):
    // 1,0,0,1,0,1,0,1 = 0b10010101
    expect(binary).toEqual(new Uint8Array([0b10010101]))
  })

  it('rounds dimension up to the nearest byte', () => {
    const binary = toUBinary(new Array(9).fill(1), 9)
    expect(binary.length).toBe(2) // ceil(9/8)
  })

  it('zero counts as not-set (threshold is strictly > 0)', () => {
    const binary = toUBinary([0], 1)
    expect(binary[0]).toBe(0)
  })
})

describe('yearFromArxivId', () => {
  it('parses a new-style id (YYMM.NNNNN)', () => {
    expect(yearFromArxivId('2301.12345')).toBe(2023)
  })

  it('parses a new-style id with a version suffix', () => {
    expect(yearFromArxivId('2301.12345v2')).toBe(2023)
  })

  it('treats YY >= 90 as 19YY (pre-2000 new-style ids)', () => {
    expect(yearFromArxivId('9901.00001')).toBe(1999)
  })

  it('parses an old-style id (archive/YYMMNNN)', () => {
    expect(yearFromArxivId('hep-th/9901001')).toBe(1999)
  })

  it('parses an old-style id with a category subfield', () => {
    expect(yearFromArxivId('cond-mat.str-el/0301001')).toBe(2003)
  })

  it('returns 0 for an unrecognized format', () => {
    expect(yearFromArxivId('not-an-id')).toBe(0)
  })
})

describe('passesFilters', () => {
  const metadata: Metadata = {
    titles: ['Paper A', 'Paper B', 'Paper C'],
    arxiv_ids: ['2301.00001', '2301.00002', '1999.00003'], // last one deliberately malformed
    categories: ['cs.LG cs.AI', 'math.CO', 'cs.LG'],
  }

  it('passes everything when filters are undefined', () => {
    expect(passesFilters(metadata, 0)).toBe(true)
    expect(passesFilters(metadata, 1, undefined)).toBe(true)
  })

  it('passes everything when categories is empty and yearRange is null', () => {
    expect(passesFilters(metadata, 1, { categories: [], yearRange: null })).toBe(true)
  })

  it('matches if the paper has ANY of the selected categories (OR, not AND)', () => {
    const filters = { categories: ['cs.AI', 'math.CO'], yearRange: null }
    expect(passesFilters(metadata, 0, filters)).toBe(true) // has cs.AI
    expect(passesFilters(metadata, 1, filters)).toBe(true) // has math.CO
    expect(passesFilters(metadata, 2, filters)).toBe(false) // has neither
  })

  it('excludes papers outside the year range', () => {
    const filters = { categories: [], yearRange: [2023, 2023] as [number, number] }
    expect(passesFilters(metadata, 0, filters)).toBe(true) // 2023
    expect(passesFilters(metadata, 2, filters)).toBe(false) // malformed id -> year 0
  })

  it('requires both a category and year match when both filters are set', () => {
    const filters = { categories: ['math.CO'], yearRange: [2023, 2023] as [number, number] }
    expect(passesFilters(metadata, 1, filters)).toBe(true) // math.CO AND 2023
  })
})

describe('scanTopK', () => {
  // A deterministic PRNG (mulberry32) so random trials are reproducible —
  // a flaky failure from an unseeded Math.random() would be useless to
  // debug.
  function mulberry32(seed: number) {
    let a = seed
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function buildRandomIndex(rand: () => number, numPapers: number, bytesPerPaper: number): Uint8Array {
    const buf = new Uint8Array(numPapers * bytesPerPaper)
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(rand() * 256)
    return buf
  }

  // The thing scanTopK replaces: collect every eligible paper's distance,
  // stable-sort by (dist, then original/idx order), slice to k. This is
  // the ground truth scanTopK's histogram approach must reproduce exactly.
  function naiveTopK(
    query: Uint8Array,
    binaryIndex: Uint8Array,
    bytesPerPaper: number,
    numPapers: number,
    k: number,
    isEligible: (i: number) => boolean
  ): Array<{ idx: number; dist: number }> {
    const all: Array<{ idx: number; dist: number }> = []
    for (let i = 0; i < numPapers; i++) {
      if (!isEligible(i)) continue
      const paper = binaryIndex.subarray(i * bytesPerPaper, (i + 1) * bytesPerPaper)
      all.push({ idx: i, dist: hammingDistance(query, paper) })
    }
    all.sort((a, b) => a.dist - b.dist) // Array.prototype.sort is stable -> ties stay in ascending idx order
    return all.slice(0, k)
  }

  it('matches a naive collect-and-sort reference across many random trials', () => {
    const rand = mulberry32(12345)
    for (let trial = 0; trial < 30; trial++) {
      const numPapers = 10 + Math.floor(rand() * 400)
      const bytesPerPaper = 4 + Math.floor(rand() * 12)
      const dim = bytesPerPaper * 8
      const k = 1 + Math.floor(rand() * 50)
      const binaryIndex = buildRandomIndex(rand, numPapers, bytesPerPaper)
      const query = buildRandomIndex(rand, 1, bytesPerPaper)
      // Randomly exclude ~20% of papers, like a filter or seed exclusion would.
      const excluded = new Set<number>()
      for (let i = 0; i < numPapers; i++) if (rand() < 0.2) excluded.add(i)
      const isEligible = (i: number) => !excluded.has(i)

      const distScratch = new Uint16Array(numPapers)
      const got = scanTopK(query, binaryIndex, bytesPerPaper, numPapers, dim, k, distScratch, isEligible)
      const want = naiveTopK(query, binaryIndex, bytesPerPaper, numPapers, k, isEligible)

      expect(got).toEqual(want)
    }
  })

  it('returns an empty array for k <= 0', () => {
    const binaryIndex = new Uint8Array([0, 1, 2, 3])
    const query = new Uint8Array([0])
    expect(scanTopK(query, binaryIndex, 1, 4, 8, 0, new Uint16Array(4), () => true)).toEqual([])
    expect(scanTopK(query, binaryIndex, 1, 4, 8, -5, new Uint16Array(4), () => true)).toEqual([])
  })

  it('returns an empty array when numPapers is 0', () => {
    const got = scanTopK(new Uint8Array([0]), new Uint8Array(0), 1, 0, 8, 10, new Uint16Array(0), () => true)
    expect(got).toEqual([])
  })

  it('returns an empty array when every paper is excluded', () => {
    const binaryIndex = new Uint8Array([0, 1, 2, 3])
    const query = new Uint8Array([0])
    const got = scanTopK(query, binaryIndex, 1, 4, 8, 10, new Uint16Array(4), () => false)
    expect(got).toEqual([])
  })

  it('returns fewer than k results when fewer than k papers are eligible', () => {
    // 2 eligible papers, asking for the top 10 — should just get those 2.
    const binaryIndex = new Uint8Array([0b00000000, 0b00000001, 0b00000011, 0b00000111])
    const query = new Uint8Array([0b00000000])
    const isEligible = (i: number) => i === 1 || i === 2
    const got = scanTopK(query, binaryIndex, 1, 4, 8, 10, new Uint16Array(4), isEligible)
    expect(got).toEqual([
      { idx: 1, dist: 1 },
      { idx: 2, dist: 2 },
    ])
  })

  it('breaks ties at the threshold distance by ascending idx, matching a stable sort', () => {
    // All 5 papers are exactly distance 1 from the query -> every ordering
    // decision comes down to the tie-break, not the distance itself.
    const binaryIndex = new Uint8Array([
      0b00000001, 0b00000010, 0b00000100, 0b00001000, 0b00010000,
    ])
    const query = new Uint8Array([0b00000000])
    const got = scanTopK(query, binaryIndex, 1, 5, 8, 3, new Uint16Array(5), () => true)
    expect(got.map((r) => r.idx)).toEqual([0, 1, 2]) // first 3 by idx, all tied at dist 1
    expect(got.every((r) => r.dist === 1)).toBe(true)
  })

  it('reuses the distScratch buffer correctly across repeated calls (no stale leftovers)', () => {
    const binaryIndex = new Uint8Array([0b00000000, 0b00000001, 0b11111111])
    const query = new Uint8Array([0b00000000])
    const scratch = new Uint16Array(3)

    // First call excludes paper 2 (which would otherwise be closest-to-worst).
    const first = scanTopK(query, binaryIndex, 1, 3, 8, 3, scratch, (i) => i !== 2)
    expect(first.map((r) => r.idx)).toEqual([0, 1])

    // Second call includes everyone — paper 2's distance must be
    // recomputed fresh, not read back from the previous call's SKIP marker.
    const second = scanTopK(query, binaryIndex, 1, 3, 8, 3, scratch, () => true)
    expect(second.map((r) => r.idx)).toEqual([0, 1, 2])
    expect(second.find((r) => r.idx === 2)?.dist).toBe(8)
  })
})
