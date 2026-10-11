import { describe, it, expect } from 'vitest'
import { catClass, catColor, catShortName } from './categories'

describe('catClass', () => {
  it.each([
    ['cs.LG cs.AI', 'cat-cs'],
    ['math.CO', 'cat-math'],
    ['stat.ML', 'cat-stat'],
    ['eess.IV cs.CV', 'cat-eess'],
    ['q-bio.NC', 'cat-bio'],
    ['q-fin.ST', 'cat-fin'],
    ['hep-th', 'cat-physics'],
    ['astro-ph.GA', 'cat-physics'],
    ['cond-mat.str-el', 'cat-physics'],
    ['gr-qc', 'cat-physics'],
    ['nucl-th', 'cat-physics'],
  ])('classifies "%s" as %s', (categories, expected) => {
    expect(catClass(categories)).toBe(expected)
  })

  it('falls back to cat-other for an unrecognized category', () => {
    expect(catClass('econ.EM')).toBe('cat-other')
  })

  it('classifies by the first (primary) category only', () => {
    // physics first, cs second — should classify as physics, not cs
    expect(catClass('hep-th cs.LG')).toBe('cat-physics')
  })
})

describe('catColor / catShortName', () => {
  it('every catClass has a corresponding color and short name', () => {
    const samples = ['cs.LG', 'math.CO', 'hep-th', 'stat.ML', 'eess.IV', 'q-bio.NC', 'q-fin.ST', 'unknown.X']
    for (const categories of samples) {
      expect(catColor(categories)).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(catShortName(categories)).toBeTruthy()
    }
  })

  it('gives distinct colors to math, eess, and fin (previously near-identical browns)', () => {
    const colors = new Set([catColor('math.CO'), catColor('eess.IV'), catColor('q-fin.ST')])
    expect(colors.size).toBe(3)
  })
})
