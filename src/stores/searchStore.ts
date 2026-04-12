import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Stage, Substep, LoadingProgress, SearchResult, DeviceType, FilterState, CategorySummary, PaperDetail } from '../types'

interface SearchState {
  // Loading state
  stage: Stage
  substep: Substep
  progress: LoadingProgress[]
  error: string | null
  device: DeviceType | null

  // Data state
  indexLoaded: boolean
  modelsLoaded: boolean
  rerankerReady: boolean
  paperCount: number

  // Search state
  query: string
  resultQuery: string
  results: SearchResult[]
  searchHistory: string[]
  filters: FilterState
  availableCategories: CategorySummary[]
  similarQuery: string | null
  isReranking: boolean
  savedResults: SearchResult[]
  paperDetails: Record<string, PaperDetail>
  detailsLoading: boolean

  // Actions
  setStage: (stage: Stage) => void
  setSubstep: (substep: Substep) => void
  setDevice: (device: DeviceType) => void
  setError: (error: string | null) => void
  updateProgress: (p: LoadingProgress) => void
  clearProgress: (file: string) => void
  setIndexLoaded: (count: number) => void
  setModelsLoaded: () => void
  setRerankerReady: () => void
  setQuery: (query: string) => void
  setResults: (results: SearchResult[]) => void
  addToHistory: (query: string) => void
  setFilters: (filters: FilterState) => void
  setAvailableCategories: (cats: CategorySummary[]) => void
  resetFilters: () => void
  setSimilarQuery: (title: string | null) => void
  setIsReranking: (v: boolean) => void
  setPaperDetails: (details: Record<string, PaperDetail>) => void
  setDetailsLoading: (v: boolean) => void
  reset: () => void
}

const initialState = {
  stage: 'idle' as Stage,
  substep: null as Substep,
  progress: [],
  error: null,
  device: null,
  indexLoaded: false,
  modelsLoaded: false,
  rerankerReady: false,
  paperCount: 0,
  query: '',
  resultQuery: '',
  results: [],
  searchHistory: [],
  filters: { categories: [], yearRange: null },
  availableCategories: [],
  similarQuery: null,
  isReranking: false,
  savedResults: [],
  paperDetails: {},
  detailsLoading: false,
}

export const useSearchStore = create<SearchState>()(
  persist(
    immer((set) => ({
      ...initialState,

      setStage: (stage) =>
        set((state) => {
          state.stage = stage
          state.substep = null
          state.progress = []
          if (stage !== 'error') state.error = null
        }),

      setSubstep: (substep) =>
        set((state) => {
          state.substep = substep
          state.progress = []
        }),

      setDevice: (device) =>
        set((state) => {
          state.device = device
        }),

      setError: (error) =>
        set((state) => {
          state.error = error
          state.stage = error ? 'error' : state.stage
        }),

      updateProgress: (p) =>
        set((state) => {
          const idx = state.progress.findIndex((x) => x.file === p.file)
          if (idx >= 0) {
            state.progress[idx] = p
          } else {
            state.progress.push(p)
          }
        }),

      clearProgress: (file) =>
        set((state) => {
          state.progress = state.progress.filter((x) => x.file !== file)
        }),

      setIndexLoaded: (count) =>
        set((state) => {
          state.indexLoaded = true
          state.paperCount = count
        }),

      setModelsLoaded: () =>
        set((state) => {
          state.modelsLoaded = true
          state.stage = 'ready'
        }),

      setRerankerReady: () =>
        set((state) => {
          state.rerankerReady = true
        }),

      setQuery: (query) =>
        set((state) => {
          state.query = query
        }),

      setResults: (results) =>
        set((state) => {
          state.results = results
          state.resultQuery = state.query
          state.isReranking = false
          if (state.stage === 'searching') state.stage = 'ready'
        }),

      addToHistory: (query) =>
        set((state) => {
          if (query && !state.searchHistory.includes(query)) {
            state.searchHistory = [query, ...state.searchHistory.slice(0, 9)]
          }
        }),

      setFilters: (filters) =>
        set((state) => {
          state.filters = filters
        }),

      setAvailableCategories: (cats) =>
        set((state) => {
          state.availableCategories = cats
        }),

      resetFilters: () =>
        set((state) => {
          state.filters = { categories: [], yearRange: null }
        }),

      setSimilarQuery: (title) =>
        set((state) => {
          if (title !== null) {
            state.savedResults = [...state.results]
          } else {
            state.results = state.savedResults
            state.savedResults = []
            state.isReranking = false
          }
          state.similarQuery = title
        }),

      setIsReranking: (v) =>
        set((state) => {
          state.isReranking = v
        }),

      setPaperDetails: (details) =>
        set((state) => {
          Object.assign(state.paperDetails, details)
        }),

      setDetailsLoading: (v) =>
        set((state) => {
          state.detailsLoading = v
        }),

      reset: () => set(() => initialState),
    })),
    {
      name: 'papyrus-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        searchHistory: state.searchHistory,
      }),
    }
  )
)
