import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Stage, Substep, LoadingProgress, SearchResult, DeviceType, FilterState, CategorySummary, PaperDetail, GraphData, ExternalResult } from '../types'

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
  indexBuiltAt: string | null

  // Search state
  query: string
  resultQuery: string
  results: SearchResult[]
  searchHistory: string[]
  filters: FilterState
  availableCategories: CategorySummary[]
  similarQuery: string | null
  similarSeedIdx: number | null
  isReranking: boolean
  resultsReranked: boolean
  similarStack: Array<{ title: string | null; seedIdx: number | null; results: SearchResult[] }>
  paperDetails: Record<string, PaperDetail>
  detailsLoading: boolean
  detailsFailed: boolean
  graph: GraphData | null
  graphOpen: boolean
  // Set when a pasted arXiv id/link isn't in the local index — distinct
  // from `error`, which puts the whole app into its global error stage;
  // this is just an inline note next to an otherwise-normal search view.
  idNotFound: string | null

  // External (Europe PMC) search — opt-in since, unlike arXiv, the raw
  // query text leaves the device when this is on.
  externalSearchEnabled: boolean
  externalResults: ExternalResult[]
  externalSearchLoading: boolean

  // Actions
  setStage: (stage: Stage) => void
  setSubstep: (substep: Substep) => void
  setDevice: (device: DeviceType) => void
  setError: (error: string | null) => void
  updateProgress: (p: LoadingProgress) => void
  clearProgress: (file: string) => void
  setIndexLoaded: (count: number, builtAt: string | null) => void
  setModelsLoaded: () => void
  setRerankerReady: () => void
  setQuery: (query: string) => void
  setResults: (results: SearchResult[], reranked: boolean) => void
  addToHistory: (query: string) => void
  setFilters: (filters: FilterState) => void
  setAvailableCategories: (cats: CategorySummary[]) => void
  resetFilters: () => void
  setSimilarQuery: (title: string | null, seedIdx: number | null) => void
  goBack: () => void
  clearSimilarHistory: () => void
  setIsReranking: (v: boolean) => void
  setPaperDetails: (details: Record<string, PaperDetail>) => void
  setDetailsLoading: (v: boolean) => void
  setDetailsFailed: (v: boolean) => void
  setGraph: (graph: GraphData | null) => void
  setGraphOpen: (open: boolean) => void
  setIdNotFound: (arxivId: string | null) => void
  setExternalSearchEnabled: (v: boolean) => void
  setExternalResults: (results: ExternalResult[]) => void
  setExternalSearchLoading: (v: boolean) => void
  reset: () => void
}

const initialState = {
  stage: 'idle' as Stage,
  substep: null as Substep,
  progress: [],
  error: null,
  device: null,
  indexLoaded: false,
  indexBuiltAt: null as string | null,
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
  similarSeedIdx: null as number | null,
  isReranking: false,
  resultsReranked: false,
  similarStack: [] as Array<{ title: string | null; seedIdx: number | null; results: SearchResult[] }>,
  paperDetails: {},
  detailsLoading: false,
  detailsFailed: false,
  graph: null as GraphData | null,
  graphOpen: false,
  idNotFound: null as string | null,
  externalSearchEnabled: false,
  externalResults: [] as ExternalResult[],
  externalSearchLoading: false,
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

      setIndexLoaded: (count, builtAt) =>
        set((state) => {
          state.indexLoaded = true
          state.paperCount = count
          state.indexBuiltAt = builtAt
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

      setResults: (results, reranked) =>
        set((state) => {
          state.results = results
          state.resultQuery = state.query
          state.isReranking = false
          state.resultsReranked = reranked
          if (!state.similarQuery) state.similarStack = []
          if (state.stage === 'searching') state.stage = 'ready'
          state.graph = null
          state.graphOpen = false
          state.idNotFound = null
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

      setSimilarQuery: (title, seedIdx) =>
        set((state) => {
          // Push current state onto stack before navigating forward
          state.similarStack.push({ title: state.similarQuery, seedIdx: state.similarSeedIdx, results: [...state.results] })
          state.similarQuery = title
          state.similarSeedIdx = seedIdx
        }),

      goBack: () =>
        set((state) => {
          const prev = state.similarStack.pop()
          if (prev) {
            state.results = prev.results
            state.similarQuery = prev.title
            state.similarSeedIdx = prev.seedIdx
          }
          state.isReranking = false
        }),

      clearSimilarHistory: () =>
        set((state) => {
          state.similarStack = []
          state.similarQuery = null
          state.similarSeedIdx = null
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

      setDetailsFailed: (v) =>
        set((state) => {
          state.detailsFailed = v
        }),

      setGraph: (graph) =>
        set((state) => {
          state.graph = graph
        }),

      setGraphOpen: (open) =>
        set((state) => {
          state.graphOpen = open
        }),

      setIdNotFound: (arxivId) =>
        set((state) => {
          state.idNotFound = arxivId
        }),

      setExternalSearchEnabled: (v) =>
        set((state) => {
          state.externalSearchEnabled = v
        }),

      setExternalResults: (results) =>
        set((state) => {
          state.externalResults = results
          state.externalSearchLoading = false
        }),

      setExternalSearchLoading: (v) =>
        set((state) => {
          state.externalSearchLoading = v
        }),

      reset: () => set(() => initialState),
    })),
    {
      name: 'papyrus-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        searchHistory: state.searchHistory,
        externalSearchEnabled: state.externalSearchEnabled,
      }),
    }
  )
)
