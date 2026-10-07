import { useEffect, useRef, useCallback } from 'react'
import { useSearchStore } from '../stores/searchStore'
import type { LoadingProgress, SearchResult, DeviceType, Stage, Substep, CategorySummary, PaperDetail, GraphData } from '../types'
import { fetchArxivDetails } from '../lib/arxiv-api'

import MxbaiWorker from '../worker?worker'
import NomicWorker from '../worker-nomic?worker'
import MinilmWorker from '../worker-minilm?worker'

type WorkerMessageType =
  | 'worker-ready'
  | 'device'
  | 'stage'
  | 'substep'
  | 'progress'
  | 'cache-hit'
  | 'index-loaded'
  | 'models-loaded'
  | 'reranker-progress'
  | 'reranker-ready'
  | 'results'
  | 'similar-hamming'
  | 'categories-summary'
  | 'graph'
  | 'graph-error'
  | 'error'

interface WorkerMessage {
  type: WorkerMessageType
  payload?: unknown
}

type ModelType = 'mxbai' | 'nomic' | 'minilm'

function createWorker(model: ModelType): Worker {
  switch (model) {
    case 'nomic':
      return new NomicWorker()
    case 'minilm':
      return new MinilmWorker()
    default:
      return new MxbaiWorker()
  }
}

export function getModelFromUrl(): ModelType {
  const params = new URLSearchParams(window.location.search)
  const model = params.get('model')
  if (model === 'nomic' || model === 'mxbai') return model
  return 'minilm'
}

export function useMLWorker() {
  const workerRef = useRef<Worker | null>(null)
  const readyRef = useRef(false)
  const requestIdRef = useRef(0)
  // Separate from requestIdRef: search/find-similar and the graph are
  // independent operations that can be in flight at once (the Graph button
  // is reachable while stage is still 'searching', since Results.tsx keeps
  // showing the previous result set). Sharing one counter/one
  // currentRequestId in the worker meant building a graph mid-search would
  // overwrite the worker's staleness-check id and cause the search's own
  // results to be silently dropped as "stale".
  const graphRequestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const {
    setStage,
    setSubstep,
    setDevice,
    setError,
    updateProgress,
    setIndexLoaded,
    setModelsLoaded,
    setResults,
    addToHistory,
    setAvailableCategories,
    setSimilarQuery,
    setIsReranking,
    setRerankerReady,
    setPaperDetails,
    setDetailsLoading,
    setGraph,
    setGraphOpen,
  } = useSearchStore()

  useEffect(() => {
    const model = getModelFromUrl()
    const worker = createWorker(model)

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, payload } = event.data

      switch (type) {
        case 'worker-ready':
          readyRef.current = true
          worker.postMessage({ type: 'load-index' })
          break

        case 'device':
          setDevice(payload as DeviceType)
          break

        case 'stage':
          setStage(payload as Stage)
          break

        case 'substep':
          setSubstep(payload as Substep)
          break

        case 'progress':
          updateProgress(payload as LoadingProgress)
          break

        case 'cache-hit':
          console.log(`[cache] Hit: ${payload}`)
          break

        case 'index-loaded': {
          const { count } = payload as { count: number }
          setIndexLoaded(count)

          // Detect WebGPU on main thread with timeout, then load models
          void (async () => {
            let preferredDevice: 'webgpu' | 'wasm' = 'wasm'
            if ('gpu' in navigator) {
              try {
                const adapter = await Promise.race([
                  (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter(),
                  new Promise(resolve => setTimeout(() => resolve(null), 3000)),
                ])
                if (adapter) preferredDevice = 'webgpu'
              } catch { /* fall through to wasm */ }
            }
            worker.postMessage({ type: 'load-models', payload: { device: preferredDevice } })
          })()
          break
        }

        case 'models-loaded': {
          setModelsLoaded()
          const params = new URLSearchParams(window.location.search)
          const urlQuery = params.get('q')
          if (urlQuery) {
            const { filters } = useSearchStore.getState()
            useSearchStore.getState().setQuery(urlQuery)
            requestIdRef.current += 1
            addToHistory(urlQuery)
            setStage('searching')
            worker.postMessage({
              type: 'search',
              payload: { query: urlQuery, topK: 10, candidates: 300, filters, requestId: requestIdRef.current },
            })
          }
          break
        }

        case 'reranker-progress':
          // background — do not touch stage FSM
          break

        case 'reranker-ready':
          setRerankerReady()
          break

        case 'categories-summary':
          setAvailableCategories(payload as CategorySummary[])
          break

        case 'graph': {
          const msgRequestId = (event.data as { requestId?: number }).requestId
          if (msgRequestId !== undefined && msgRequestId !== graphRequestIdRef.current) break
          setGraph(payload as GraphData)
          break
        }

        case 'graph-error': {
          const msgRequestId = (event.data as { requestId?: number }).requestId
          if (msgRequestId !== undefined && msgRequestId !== graphRequestIdRef.current) break
          console.warn('[graph] Failed to build graph:', payload)
          // Close the panel rather than leaving it stuck on "Building
          // graph…" forever — this is a secondary view, not worth taking
          // the whole app to the global error stage over.
          setGraph(null)
          setGraphOpen(false)
          break
        }

        case 'similar-hamming': {
          const msgRequestId = (event.data as { requestId?: number }).requestId
          if (msgRequestId !== undefined && msgRequestId !== requestIdRef.current) break
          setResults(payload as SearchResult[])
          setIsReranking(true)
          break
        }

        case 'results': {
          const msgRequestId = (event.data as { requestId?: number }).requestId
          if (msgRequestId !== undefined && msgRequestId !== requestIdRef.current) break
          const results = payload as SearchResult[]
          setResults(results)
          setIsReranking(false)

          // Cancel any in-flight abstract fetch
          abortControllerRef.current?.abort()
          const controller = new AbortController()
          abortControllerRef.current = controller

          const ids = results.slice(0, 10).map(r => r.arxiv_id)
          if (ids.length > 0) {
            setDetailsLoading(true)
            fetchArxivDetails(ids, controller.signal).then(detailsMap => {
              if (controller.signal.aborted) return
              const details: Record<string, PaperDetail> = {}
              detailsMap.forEach((v, k) => {
                details[k] = { abstract: v.abstract, authors: v.authors, published: v.published }
              })
              setPaperDetails(details)
              setDetailsLoading(false)
            }).catch((e) => {
              if ((e as Error).name !== 'AbortError') setDetailsLoading(false)
            })
          }

          // Expose debug info for Playwright
          const debug = (event.data as { debug?: unknown }).debug
          if (debug) {
            ;(window as unknown as { __searchDebug: unknown }).__searchDebug = debug
          }
          break
        }

        case 'error':
          setError(payload as string)
          break
      }
    }

    worker.onerror = (error) => {
      setError(error.message)
    }

    workerRef.current = worker

    return () => {
      abortControllerRef.current?.abort()
      worker.terminate()
    }
  }, [setStage, setSubstep, setDevice, setError, updateProgress, setIndexLoaded, setModelsLoaded, setResults, addToHistory, setAvailableCategories, setIsReranking, setRerankerReady, setPaperDetails, setDetailsLoading, setGraph, setGraphOpen])

  const search = useCallback(
    (query: string, topK = 10, candidates = 300) => {
      if (!workerRef.current || !readyRef.current) return
      requestIdRef.current += 1
      const { filters } = useSearchStore.getState()
      useSearchStore.getState().setError(null)
      useSearchStore.getState().clearSimilarHistory()
      addToHistory(query)
      setStage('searching')
      const url = new URL(window.location.href)
      url.searchParams.set('q', query)
      window.history.replaceState(null, '', url.toString())
      workerRef.current.postMessage({
        type: 'search',
        payload: { query, topK, candidates, filters, requestId: requestIdRef.current },
      })
    },
    [addToHistory, setStage]
  )

  const findSimilar = useCallback(
    (idx: number, title: string) => {
      if (!workerRef.current || !readyRef.current) return
      requestIdRef.current += 1
      useSearchStore.getState().setError(null)
      setSimilarQuery(title)
      setStage('searching')
      workerRef.current.postMessage({
        type: 'find-similar',
        payload: { idx, topK: 10, candidates: 300, requestId: requestIdRef.current },
      })
    },
    [setSimilarQuery, setStage]
  )

  const buildGraph = useCallback(
    (seedIdxs: number[]) => {
      if (!workerRef.current || !readyRef.current) return
      graphRequestIdRef.current += 1
      const { filters } = useSearchStore.getState()
      workerRef.current.postMessage({
        type: 'build-graph',
        payload: { seedIdxs, filters, requestId: graphRequestIdRef.current },
      })
    },
    []
  )

  return { search, findSimilar, buildGraph }
}
