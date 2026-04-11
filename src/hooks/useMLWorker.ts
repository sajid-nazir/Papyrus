import { useEffect, useRef, useCallback } from 'react'
import { useSearchStore } from '../stores/searchStore'
import type { LoadingProgress, SearchResult, DeviceType, Stage, Substep, CategorySummary } from '../types'

import MxbaiWorker from '../worker?worker'
import NomicWorker from '../worker-nomic?worker'
import MinilmWorker from '../worker-minilm?worker'

type WorkerMessageType =
  | 'worker-ready'
  | 'device'
  | 'stage'
  | 'substep'
  | 'progress'
  | 'index-loaded'
  | 'models-loaded'
  | 'reranker-progress'
  | 'reranker-ready'
  | 'results'
  | 'similar-hamming'
  | 'categories-summary'
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

        case 'index-loaded': {
          const { count } = payload as { count: number }
          setIndexLoaded(count)
          worker.postMessage({ type: 'load-models' })
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
          setResults(payload as SearchResult[])
          setIsReranking(false)
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
      worker.terminate()
    }
  }, [setStage, setSubstep, setDevice, setError, updateProgress, setIndexLoaded, setModelsLoaded, setResults, setAvailableCategories, setSimilarQuery, setIsReranking, setRerankerReady])

  const search = useCallback(
    (query: string, topK = 10, candidates = 300) => {
      if (!workerRef.current || !readyRef.current) return
      requestIdRef.current += 1
      const { filters } = useSearchStore.getState()
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
      setSimilarQuery(title)
      setStage('searching')
      workerRef.current.postMessage({
        type: 'find-similar',
        payload: { idx, topK: 10, candidates: 300, requestId: requestIdRef.current },
      })
    },
    [setSimilarQuery, setStage]
  )

  return { search, findSimilar }
}
