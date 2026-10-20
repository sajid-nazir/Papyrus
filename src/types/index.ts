export interface Paper {
  arxiv_id: string
  title: string
  categories: string
}

export interface ColumnarMetadata {
  titles: string[]
  arxiv_ids: string[]
  categories: string[]
}

export interface SearchResult extends Paper {
  rank: number
  score: number
  hammingDist?: number
  idx: number
}

export interface LoadingProgress {
  file: string
  loaded: number
  total: number
  progress: number
}

export type Stage =
  | 'idle'
  | 'loading-index'
  | 'loading-embedder'
  | 'ready'
  | 'searching'
  | 'error'

export type Substep =
  | 'downloading-embeddings'
  | 'downloading-metadata'
  | 'loading-memory'
  | 'downloading-model'
  | 'initializing'
  | null

export interface StageInfo {
  stage: Stage
  substep: Substep
  substepProgress: number
}

export type DeviceType = 'webgpu' | 'wasm' | 'cpu'

export interface WorkerMessage {
  type: 'init' | 'search' | 'progress' | 'result' | 'error' | 'ready'
  payload?: unknown
}

export interface SearchRequest {
  query: string
  topK?: number
  candidates?: number
}

export interface FilterState {
  categories: string[]
  yearRange: [number, number] | null
}

export interface CategorySummary {
  category: string
  count: number
}

export interface PaperDetail {
  abstract: string
  authors: string[]
  published: string
}

export interface GraphNode extends Paper {
  idx: number
  isSeed: boolean
}

export interface GraphEdge {
  source: number
  target: number
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// A result from an external source (currently just Europe PMC) — distinct
// from SearchResult because it has no index position, so it can't be a
// Find Similar / graph seed the way an arXiv result can.
export interface ExternalResult {
  source: 'europepmc'
  id: string
  title: string
  authors: string[]
  abstract: string
  journal: string | null
  year: number | null
  url: string
  doi: string | null
}

// A paper saved to the reading list — a flattened snapshot taken at save
// time (not a live reference), so it still exports correctly even if the
// paper scrolls out of the current search results or the search changes.
// `idx` is only present for arXiv papers already in the local index (used
// later for embedding-based "more like these"); Europe PMC papers don't
// have one.
export interface SavedPaper {
  key: string // `${source}:${id}` — unique across both sources
  source: 'arxiv' | 'europepmc'
  id: string
  idx: number | null
  title: string
  authors: string[]
  year: number | null
  journal: string | null
  url: string
  doi: string | null
  savedAt: number
}
