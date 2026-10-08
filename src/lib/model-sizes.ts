import { getModelFromUrl } from '../hooks/useMLWorker'

export const MODEL_SIZES: Record<string, { index: string; embedder: string }> = {
  mxbai:   { index: '63 MB',  embedder: '337 MB' },
  nomic:   { index: '63 MB',  embedder: '69 MB'  },
  minilm:  { index: '47 MB',  embedder: '23 MB'  },
}

const RERANKER_MB = 23

export function currentModelSizes() {
  return MODEL_SIZES[getModelFromUrl()] ?? MODEL_SIZES.minilm
}

export function totalDownloadMB(): number {
  const sizes = currentModelSizes()
  return parseFloat(sizes.index) + parseFloat(sizes.embedder) + RERANKER_MB
}
