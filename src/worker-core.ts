import {
  pipeline,
  env,
  AutoTokenizer,
  AutoModelForSequenceClassification,
  type FeatureExtractionPipeline,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers'
import { getCached, setCache, clearCacheEntry } from './lib/indexeddb-cache'

interface ChunkManifest {
  version: string
  totalSize: number
  chunkSize: number
  chunks: Array<{ name: string; size: number }>
}

env.allowLocalModels = false
env.useBrowserCache = true

// Proxy HuggingFace through our own domain to avoid CORS issues in production
if (!self.location.origin.includes('localhost')) {
  env.remoteHost = `${self.location.origin}/hf-proxy`
}

export type DeviceType = 'webgpu' | 'wasm' | 'cpu'
export type ProgressCallback = (data: { file: string; loaded: number; total: number; progress: number }) => void

const DEFAULT_BIN_SIZE_BYTES = 66_000_000
const DEFAULT_METADATA_SIZE_BYTES = 180_000_000
const CACHE_VERSION = 'v1'

export interface ModelConfig {
  modelId: string
  queryPrefix: string
  dimension: number
  pooling: 'mean' | 'cls'
  dataPath: string
  defaultBinSize?: number
}

interface ProgressEvent {
  status: string
  file?: string
  loaded?: number
  total?: number
  progress?: number
}

class EmbedderPipeline {
  static instance: FeatureExtractionPipeline | null = null
  static device: DeviceType = 'wasm'
  private static currentModelId: string | null = null

  static async getInstance(config: ModelConfig, progressCallback: ProgressCallback, forceReinit = false): Promise<FeatureExtractionPipeline> {
    if (!this.instance || this.currentModelId !== config.modelId || forceReinit) {
      self.postMessage({ type: 'device', payload: this.device })

      const embedder = await pipeline('feature-extraction', config.modelId, {
        dtype: 'q8',
        device: this.device,
        progress_callback: (p: ProgressEvent) => {
          if (p.status === 'progress' && p.file) {
            progressCallback({ file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0, progress: p.progress ?? 0 })
          }
        },
      })
      this.instance = embedder as unknown as FeatureExtractionPipeline
      this.currentModelId = config.modelId
    }
    return this.instance
  }
}

class Reranker {
  private static model: PreTrainedModel | null = null
  private static tokenizer: PreTrainedTokenizer | null = null
  private static readonly MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2'

  static async getInstance(progressCallback: ProgressCallback): Promise<{ model: PreTrainedModel; tokenizer: PreTrainedTokenizer }> {
    if (!this.model || !this.tokenizer) {
      try {
        this.model = await AutoModelForSequenceClassification.from_pretrained(this.MODEL_ID, {
          dtype: 'q8',
          device: EmbedderPipeline.device,
          progress_callback: (p: ProgressEvent) => {
            if (p.status === 'progress' && p.file) {
              progressCallback({ file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0, progress: p.progress ?? 0 })
            }
          },
        })
      } catch {
        // WebGPU may fail for reranker — fall back to wasm
        this.model = await AutoModelForSequenceClassification.from_pretrained(this.MODEL_ID, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: (p: ProgressEvent) => {
            if (p.status === 'progress' && p.file) {
              progressCallback({ file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0, progress: p.progress ?? 0 })
            }
          },
        })
      }
      this.tokenizer = await AutoTokenizer.from_pretrained(this.MODEL_ID)
    }
    return { model: this.model, tokenizer: this.tokenizer }
  }

  static async rerank(query: string, documents: string[]): Promise<number[]> {
    const { model, tokenizer } = await this.getInstance(() => {})

    const inputs = tokenizer(new Array(documents.length).fill(query), {
      text_pair: documents,
      padding: true,
      truncation: true,
    })

    const output = await model(inputs)
    const logits = output.logits.tolist() as (number | number[])[]

    return logits.map((row) => (Array.isArray(row) ? row[0] : row))
  }
}

const POPCOUNT = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1]
}

function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    dist += POPCOUNT[a[i] ^ b[i]]
  }
  return dist
}

function toUBinary(embedding: number[], dim: number): Uint8Array {
  const bytes = Math.ceil(dim / 8)
  const binary = new Uint8Array(bytes)
  for (let i = 0; i < dim; i++) {
    if (embedding[i] > 0) {
      binary[Math.floor(i / 8)] |= 1 << (7 - (i % 8))
    }
  }
  return binary
}

interface Metadata {
  titles: string[]
  arxiv_ids: string[]
  categories: string[]
}

function yearFromArxivId(id: string): number {
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

async function fetchWithProgress(
  url: string,
  fileName: string,
  defaultSize: number,
  progressCallback: ProgressCallback
): Promise<Uint8Array> {
  // Try cache first
  try {
    const cached = await getCached(url, CACHE_VERSION)
    if (cached) {
      progressCallback({ file: fileName, loaded: cached.length, total: cached.length, progress: 100 })
      self.postMessage({ type: 'cache-hit', payload: fileName })
      return cached
    }
  } catch { /* cache miss or error, proceed with fetch */ }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${fileName}`)

  const total = Number(response.headers.get('content-length')) || defaultSize
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    progressCallback({ file: fileName, loaded, total, progress: (loaded / total) * 100 })
  }

  const buffer = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  // Cache with quota awareness
  try {
    if (typeof navigator.storage?.estimate === 'function') {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate()
      const remaining = quota - usage
      if (buffer.byteLength > remaining * 0.9) {
        console.warn(`[cache] Skipping ${fileName}: exceeds 90% of remaining quota`)
        return buffer
      }
    }
    await setCache(url, buffer, CACHE_VERSION)
  } catch (e) {
    console.warn(`[cache] Write failed for ${fileName}:`, e)
    try { await clearCacheEntry(url) } catch { /* best-effort cleanup */ }
  }

  return buffer
}

async function fetchChunked(
  basePath: string,
  progressCallback: ProgressCallback
): Promise<Uint8Array> {
  // Try manifest first; fallback to single file
  let manifest: ChunkManifest
  try {
    const res = await fetch(`${basePath}/chunk_manifest.json`)
    if (!res.ok) throw new Error('No manifest')
    manifest = await res.json() as ChunkManifest
  } catch {
    return fetchWithProgress(
      `${basePath}/binary_embeddings.bin`,
      'binary_embeddings.bin',
      DEFAULT_BIN_SIZE_BYTES,
      progressCallback
    )
  }

  // Clean up old single-file cache entry (migration)
  try { await clearCacheEntry(`${basePath}/binary_embeddings.bin`) } catch { /* best-effort */ }

  const buffer = new Uint8Array(manifest.totalSize)
  const chunkLoadedBytes = new Array(manifest.chunks.length).fill(0)
  let completedBytes = 0
  const concurrency = 4

  function reportProgress() {
    const inFlight = chunkLoadedBytes.reduce((s: number, b: number) => s + b, 0)
    const total = Math.min(completedBytes + inFlight, manifest.totalSize)
    progressCallback({
      file: 'binary_embeddings',
      loaded: total,
      total: manifest.totalSize,
      progress: (total / manifest.totalSize) * 100,
    })
  }

  for (let i = 0; i < manifest.chunks.length; i += concurrency) {
    const batch = manifest.chunks.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (chunk, batchIdx) => {
        const chunkIdx = i + batchIdx
        const offset = chunkIdx * manifest.chunkSize
        chunkLoadedBytes[chunkIdx] = 0
        const data = await fetchWithProgress(
          `${basePath}/${chunk.name}`,
          chunk.name,
          chunk.size,
          (p) => { chunkLoadedBytes[chunkIdx] = p.loaded; reportProgress() }
        )
        return { data, offset, chunkIdx }
      })
    )

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const { data, offset, chunkIdx } = result.value
        buffer.set(data, offset)
        chunkLoadedBytes[chunkIdx] = 0
        completedBytes += data.length
      }
    }

    // Retry failed chunks (max 2 attempts)
    const failed = settled
      .map((r, idx) => r.status === 'rejected' ? { chunk: batch[idx], chunkIdx: i + idx } : null)
      .filter((x): x is { chunk: { name: string; size: number }; chunkIdx: number } => x !== null)

    for (const { chunk, chunkIdx } of failed) {
      const offset = chunkIdx * manifest.chunkSize
      let retryData: Uint8Array | null = null
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await new Promise(r => setTimeout(r, attempt * 1000))
          retryData = await fetchWithProgress(
            `${basePath}/${chunk.name}`,
            chunk.name,
            chunk.size,
            (p) => { chunkLoadedBytes[chunkIdx] = p.loaded; reportProgress() }
          )
          break
        } catch { /* retry */ }
      }
      if (!retryData) throw new Error(`Failed to fetch chunk ${chunk.name} after retries`)
      buffer.set(retryData, offset)
      chunkLoadedBytes[chunkIdx] = 0
      completedBytes += retryData.length
    }
  }

  return buffer
}

export function createSearchWorker(config: ModelConfig): void {
  let binaryIndex: Uint8Array | null = null
  let metadata: Metadata | null = null
  let currentRequestId = 0
  let rerankerReady = false

  const progressCallback: ProgressCallback = (data) => {
    self.postMessage({ type: 'progress', payload: data })
  }

  self.addEventListener('message', async (event: MessageEvent) => {
    const { type, payload } = event.data

    try {
      switch (type) {
        case 'load-index': {
          self.postMessage({ type: 'stage', payload: 'loading-index' })

          self.postMessage({ type: 'substep', payload: 'downloading-embeddings' })
          binaryIndex = await fetchChunked(config.dataPath, progressCallback)

          self.postMessage({ type: 'substep', payload: 'downloading-metadata' })
          const metaBuffer = await fetchWithProgress(
            `${config.dataPath}/metadata_columnar.json`,
            'metadata.json',
            DEFAULT_METADATA_SIZE_BYTES,
            progressCallback
          )

          self.postMessage({ type: 'substep', payload: 'loading-memory' })
          const metaText = new TextDecoder().decode(metaBuffer)
          metadata = JSON.parse(metaText)

          self.postMessage({
            type: 'index-loaded',
            payload: { count: metadata?.titles.length ?? 0 },
          })

          // Compute and emit category summary
          const catCounts = new Map<string, number>()
          for (const cat of metadata!.categories) {
            for (const c of cat.split(' ')) {
              catCounts.set(c, (catCounts.get(c) || 0) + 1)
            }
          }
          const categorySummary = Array.from(catCounts.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count)
          self.postMessage({ type: 'categories-summary', payload: categorySummary })
          break
        }

        case 'load-models': {
          const { device } = (payload ?? {}) as { device?: 'webgpu' | 'wasm' }
          EmbedderPipeline.device = device ?? 'wasm'

          // Phase 1: embedder — search becomes available immediately
          self.postMessage({ type: 'stage', payload: 'loading-embedder' })
          self.postMessage({ type: 'substep', payload: 'downloading-model' })
          await EmbedderPipeline.getInstance(config, progressCallback)
          self.postMessage({ type: 'substep', payload: 'initializing' })
          self.postMessage({ type: 'models-loaded' })

          // Phase 2: reranker loads in background — does NOT touch stage FSM
          self.postMessage({ type: 'reranker-progress', payload: { status: 'downloading' } })
          await Reranker.getInstance((data) => {
            self.postMessage({ type: 'reranker-progress', payload: { status: 'progress', ...data } })
          })
          rerankerReady = true
          self.postMessage({ type: 'reranker-ready' })
          break
        }

        case 'search': {
          if (!binaryIndex || !metadata) {
            throw new Error('Index not loaded')
          }

          const { query, topK = 10, candidates = 300, requestId, filters } = payload as {
            query: string
            topK?: number
            candidates?: number
            requestId?: number
            filters?: { categories: string[]; yearRange: [number, number] | null }
          }

          if (requestId !== undefined) currentRequestId = requestId

          self.postMessage({ type: 'stage', payload: 'searching', requestId })

          const embedder = await EmbedderPipeline.getInstance(config, progressCallback)
          const promptedQuery = config.queryPrefix ? `${config.queryPrefix}${query}` : query

          let embedding
          try {
            embedding = await embedder(promptedQuery, { pooling: config.pooling, normalize: true })
          } catch (e) {
            if (EmbedderPipeline.device === 'webgpu') {
              console.warn('[worker] GPU inference failed, falling back to WASM:', e)
              EmbedderPipeline.device = 'wasm'
              EmbedderPipeline.instance = null
              const wasmEmbedder = await EmbedderPipeline.getInstance(config, progressCallback, true)
              embedding = await wasmEmbedder(promptedQuery, { pooling: config.pooling, normalize: true })
              self.postMessage({ type: 'device', payload: 'wasm' })
            } else {
              throw e
            }
          }

          if (requestId !== undefined && requestId !== currentRequestId) break

          const rawData = embedding.data as Float32Array
          const fullEmb = Array.from(rawData).slice(0, config.dimension)
          const binaryQuery = toUBinary(fullEmb, config.dimension)

          const bytesPerPaper = config.dimension / 8
          const numPapers = metadata.titles.length
          const candidateResults: Array<{ idx: number; dist: number }> = []

          for (let i = 0; i < numPapers; i++) {
            // Apply filters
            if (filters) {
              if (filters.categories.length > 0) {
                const paperCats = metadata.categories[i].split(' ')
                if (!filters.categories.some(fc => paperCats.includes(fc))) continue
              }
              if (filters.yearRange) {
                const year = yearFromArxivId(metadata.arxiv_ids[i])
                if (year < filters.yearRange[0] || year > filters.yearRange[1]) continue
              }
            }
            const paperBinary = binaryIndex.subarray(i * bytesPerPaper, (i + 1) * bytesPerPaper)
            const dist = hammingDistance(binaryQuery, paperBinary)
            candidateResults.push({ idx: i, dist })
          }

          candidateResults.sort((a, b) => a.dist - b.dist)
          const topCandidates = candidateResults.slice(0, candidates)

          if (topCandidates.length === 0) {
            self.postMessage({ type: 'results', payload: [], requestId })
            break
          }

          if (rerankerReady) {
            const titles = topCandidates.map((c) => metadata!.titles[c.idx])
            const scores = await Reranker.rerank(query, titles)

            if (requestId !== undefined && requestId !== currentRequestId) break

            const results = topCandidates.map((c, i) => ({
              rank: 0,
              idx: c.idx,
              arxiv_id: metadata!.arxiv_ids[c.idx],
              title: metadata!.titles[c.idx],
              categories: metadata!.categories[c.idx],
              score: scores[i],
              hammingDist: c.dist,
            }))
            results.sort((a, b) => b.score - a.score)
            for (let i = 0; i < results.length; i++) results[i].rank = i + 1
            self.postMessage({ type: 'results', payload: results.slice(0, topK), requestId })
          } else {
            const results = topCandidates.slice(0, topK).map((c, i) => ({
              rank: i + 1,
              idx: c.idx,
              arxiv_id: metadata!.arxiv_ids[c.idx],
              title: metadata!.titles[c.idx],
              categories: metadata!.categories[c.idx],
              score: -c.dist,
              hammingDist: c.dist,
            }))
            self.postMessage({ type: 'results', payload: results, requestId })
          }
          break
        }

        case 'find-similar': {
          if (!binaryIndex || !metadata) {
            throw new Error('Index not loaded')
          }

          const { idx, topK = 10, candidates = 300, requestId } = payload as {
            idx: number
            topK?: number
            candidates?: number
            requestId?: number
          }

          if (requestId !== undefined) currentRequestId = requestId

          self.postMessage({ type: 'stage', payload: 'searching', requestId })

          const bytesPerPaper = config.dimension / 8
          const queryBinary = binaryIndex.slice(idx * bytesPerPaper, (idx + 1) * bytesPerPaper)
          const numPapers = metadata.titles.length
          const candidateResults: Array<{ idx: number; dist: number }> = []

          for (let i = 0; i < numPapers; i++) {
            if (i === idx) continue
            const paperBinary = binaryIndex.subarray(i * bytesPerPaper, (i + 1) * bytesPerPaper)
            candidateResults.push({ idx: i, dist: hammingDistance(queryBinary, paperBinary) })
          }

          candidateResults.sort((a, b) => a.dist - b.dist)
          const topCandidates = candidateResults.slice(0, candidates)

          const hammingResults = topCandidates.slice(0, topK).map((c, i) => ({
            rank: i + 1,
            idx: c.idx,
            arxiv_id: metadata!.arxiv_ids[c.idx],
            title: metadata!.titles[c.idx],
            categories: metadata!.categories[c.idx],
            score: 0,
            hammingDist: c.dist,
          }))
          self.postMessage({ type: 'similar-hamming', payload: hammingResults, requestId })

          if (rerankerReady) {
            const titles = topCandidates.map((c) => metadata!.titles[c.idx])
            const sourceTitle = metadata!.titles[idx]
            const scores = await Reranker.rerank(sourceTitle, titles)

            if (requestId !== undefined && requestId !== currentRequestId) break

            const results = topCandidates.map((c, i) => ({
              rank: 0,
              idx: c.idx,
              arxiv_id: metadata!.arxiv_ids[c.idx],
              title: metadata!.titles[c.idx],
              categories: metadata!.categories[c.idx],
              score: scores[i],
              hammingDist: c.dist,
            }))
            results.sort((a, b) => b.score - a.score)
            for (let i = 0; i < results.length; i++) results[i].rank = i + 1
            self.postMessage({ type: 'results', payload: results.slice(0, topK), requestId })
          }
          break
        }
      }
    } catch (error) {
      self.postMessage({
        type: 'error',
        payload: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  self.postMessage({ type: 'worker-ready' })
}
