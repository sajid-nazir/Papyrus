import {
  pipeline,
  env,
  AutoTokenizer,
  AutoModelForSequenceClassification,
  type FeatureExtractionPipeline,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

export type DeviceType = 'webgpu' | 'wasm' | 'cpu'
export type ProgressCallback = (data: { file: string; loaded: number; total: number; progress: number }) => void

const DEFAULT_BIN_SIZE_BYTES = 66_000_000
const DEFAULT_METADATA_SIZE_BYTES = 180_000_000

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
  private static instance: FeatureExtractionPipeline | null = null
  static device: DeviceType = 'wasm'
  private static currentModelId: string | null = null

  static async getInstance(config: ModelConfig, progressCallback: ProgressCallback): Promise<FeatureExtractionPipeline> {
    if (!this.instance || this.currentModelId !== config.modelId) {
      this.device = 'wasm'
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
      this.model = await AutoModelForSequenceClassification.from_pretrained(this.MODEL_ID, {
        dtype: 'q8',
        device: EmbedderPipeline.device,
        progress_callback: (p: ProgressEvent) => {
          if (p.status === 'progress' && p.file) {
            progressCallback({ file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0, progress: p.progress ?? 0 })
          }
        },
      })
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

  return buffer
}

export function createSearchWorker(config: ModelConfig): void {
  let binaryIndex: Uint8Array | null = null
  let metadata: Metadata | null = null
  let currentRequestId = 0

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
          binaryIndex = await fetchWithProgress(
            `${config.dataPath}/binary_embeddings.bin`,
            'binary_embeddings.bin',
            config.defaultBinSize ?? DEFAULT_BIN_SIZE_BYTES,
            progressCallback
          )

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
          self.postMessage({ type: 'stage', payload: 'loading-embedder' })
          self.postMessage({ type: 'substep', payload: 'downloading-model' })
          await EmbedderPipeline.getInstance(config, progressCallback)
          self.postMessage({ type: 'substep', payload: 'initializing' })

          self.postMessage({ type: 'stage', payload: 'loading-reranker' })
          self.postMessage({ type: 'substep', payload: 'downloading-model' })
          await Reranker.getInstance(progressCallback)
          self.postMessage({ type: 'substep', payload: 'initializing' })

          self.postMessage({ type: 'models-loaded' })
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
          const embedding = await embedder(promptedQuery, { pooling: config.pooling, normalize: true })

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
          for (let i = 0; i < results.length; i++) {
            results[i].rank = i + 1
          }

          self.postMessage({
            type: 'results',
            payload: results.slice(0, topK),
            requestId,
          })
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
