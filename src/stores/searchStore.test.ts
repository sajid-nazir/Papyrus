import { describe, it, expect, beforeEach } from 'vitest'
import { useSearchStore } from './searchStore'
import type { SearchResult } from '../types'

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    rank: 1,
    idx: 0,
    arxiv_id: '2301.00001',
    title: 'A Paper',
    categories: 'cs.LG',
    score: 0.5,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  useSearchStore.getState().reset()
})

describe('addToHistory', () => {
  it('adds a query to the front of history', () => {
    useSearchStore.getState().addToHistory('transformers')
    expect(useSearchStore.getState().searchHistory).toEqual(['transformers'])
  })

  it('does not add a duplicate of an already-present query', () => {
    useSearchStore.getState().addToHistory('transformers')
    useSearchStore.getState().addToHistory('transformers')
    expect(useSearchStore.getState().searchHistory).toEqual(['transformers'])
  })

  it('ignores an empty query', () => {
    useSearchStore.getState().addToHistory('')
    expect(useSearchStore.getState().searchHistory).toEqual([])
  })

  it('caps history at 10 entries, newest first', () => {
    for (let i = 0; i < 12; i++) useSearchStore.getState().addToHistory(`query ${i}`)
    const history = useSearchStore.getState().searchHistory
    expect(history).toHaveLength(10)
    expect(history[0]).toBe('query 11') // most recent first
    expect(history).not.toContain('query 0') // oldest two evicted
    expect(history).not.toContain('query 1')
  })
})

describe('setResults', () => {
  it('records whether these results were actually reranked', () => {
    useSearchStore.getState().setResults([makeResult()], true)
    expect(useSearchStore.getState().resultsReranked).toBe(true)

    useSearchStore.getState().setResults([makeResult()], false)
    expect(useSearchStore.getState().resultsReranked).toBe(false)
  })

  it('clears any open graph, since it was built from the previous result set', () => {
    useSearchStore.getState().setGraph({ nodes: [], edges: [] })
    useSearchStore.getState().setGraphOpen(true)
    useSearchStore.getState().setResults([makeResult()], true)
    expect(useSearchStore.getState().graph).toBeNull()
    expect(useSearchStore.getState().graphOpen).toBe(false)
  })

  it('moves stage from searching to ready', () => {
    useSearchStore.getState().setStage('searching')
    useSearchStore.getState().setResults([makeResult()], true)
    expect(useSearchStore.getState().stage).toBe('ready')
  })
})

describe('similar-view navigation (similarSeedIdx / back stack)', () => {
  it('setSimilarQuery stores both the title and the seed idx', () => {
    useSearchStore.getState().setSimilarQuery('Original Paper', 42)
    expect(useSearchStore.getState().similarQuery).toBe('Original Paper')
    expect(useSearchStore.getState().similarSeedIdx).toBe(42)
  })

  it('goBack restores the previous similarQuery, seedIdx, and results', () => {
    const store = useSearchStore.getState()
    store.setResults([makeResult({ idx: 1 })], true)
    store.setSimilarQuery('First similar view', 1)
    store.setResults([makeResult({ idx: 2 })], true)
    store.setSimilarQuery('Second similar view', 2)

    useSearchStore.getState().goBack()

    const state = useSearchStore.getState()
    expect(state.similarQuery).toBe('First similar view')
    expect(state.similarSeedIdx).toBe(1)
    expect(state.results).toEqual([makeResult({ idx: 2 })])
  })

  it('clearSimilarHistory resets the stack, query, and seed idx', () => {
    const store = useSearchStore.getState()
    store.setSimilarQuery('Some view', 7)
    store.clearSimilarHistory()

    const state = useSearchStore.getState()
    expect(state.similarQuery).toBeNull()
    expect(state.similarSeedIdx).toBeNull()
    expect(state.similarStack).toEqual([])
  })
})

describe('resetFilters', () => {
  it('clears categories and year range', () => {
    useSearchStore.getState().setFilters({ categories: ['cs.LG'], yearRange: [2020, 2024] })
    useSearchStore.getState().resetFilters()
    expect(useSearchStore.getState().filters).toEqual({ categories: [], yearRange: null })
  })
})

describe('setError', () => {
  it('moves stage to error when an error is set', () => {
    useSearchStore.getState().setStage('ready')
    useSearchStore.getState().setError('Something broke')
    expect(useSearchStore.getState().stage).toBe('error')
    expect(useSearchStore.getState().error).toBe('Something broke')
  })

  it('clearing the error does not force a stage change', () => {
    useSearchStore.getState().setStage('ready')
    useSearchStore.getState().setError(null)
    expect(useSearchStore.getState().stage).toBe('ready')
  })
})
