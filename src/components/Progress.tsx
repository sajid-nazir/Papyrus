import { useSearchStore } from '../stores/searchStore'
import { getModelFromUrl } from '../hooks/useMLWorker'
import { clearAllCachedData } from '../lib/clear-cache'

const MODEL_SIZES: Record<string, { index: string; embedder: string }> = {
  mxbai:   { index: '63 MB',  embedder: '337 MB' },
  nomic:   { index: '63 MB',  embedder: '69 MB'  },
  minilm:  { index: '47 MB',  embedder: '23 MB'  },
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ClearCacheButton({ totalLabel }: { totalLabel: string }) {
  async function handleClick() {
    if (!window.confirm(`Delete ~${totalLabel} of cached index and models? The app will re-download on reload.`)) return
    await clearAllCachedData()
    window.location.reload()
  }
  return <button className="copy-link-btn" onClick={handleClick}>Clear cached data</button>
}

export function Progress() {
  const { stage, substep, progress, error, device, paperCount } = useSearchStore()
  const model = getModelFromUrl()
  const sizes = MODEL_SIZES[model] ?? MODEL_SIZES.minilm
  const totalLabel = `${parseFloat(sizes.index) + parseFloat(sizes.embedder)} MB`

  if (stage === 'idle') return null
  if (stage === 'error') {
    return (
      <div className="progress-error">
        <span>{error}</span>
        <button className="copy-link-btn" onClick={() => window.location.reload()}>Retry</button>
        <ClearCacheButton totalLabel={totalLabel} />
      </div>
    )
  }
  if (stage === 'ready' || stage === 'searching') {
    return (
      <div className="progress-ready">
        ✓ Ready · {paperCount.toLocaleString()} papers · {device?.toUpperCase()}
        <ClearCacheButton totalLabel={totalLabel} />
      </div>
    )
  }

  const stageLabel: Record<string, string> = {
    'loading-index':    `Loading index (${sizes.index})`,
    'loading-embedder': `Loading embedder (${sizes.embedder})`,
    'loading-reranker': 'Loading reranker (23 MB)',
  }

  const substepLabel: Record<string, string> = {
    'downloading-embeddings': 'Downloading embeddings…',
    'downloading-metadata':   'Downloading metadata…',
    'loading-memory':         'Loading into memory…',
    'downloading-model':      'Downloading model…',
    'initializing':           'Initializing…',
  }

  return (
    <div className="progress">
      <div className="progress-stage">{stageLabel[stage] ?? stage}</div>
      {substep && <div className="progress-substep">{substepLabel[substep] ?? substep}</div>}
      {progress.map((p) => (
        <div key={p.file} className="progress-bar-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${p.progress}%` }} />
          </div>
          <span>{formatBytes(p.loaded)} / {formatBytes(p.total)}</span>
        </div>
      ))}
    </div>
  )
}
