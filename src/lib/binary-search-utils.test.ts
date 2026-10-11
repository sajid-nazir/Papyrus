import { describe, it, expect } from 'vitest'
import { hammingDistance, toUBinary, yearFromArxivId, passesFilters, type Metadata } from './binary-search-utils'

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
