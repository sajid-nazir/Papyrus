import { useSearchStore } from '../stores/searchStore'
import { clearAllCachedData } from '../lib/clear-cache'
import { currentModelSizes, totalDownloadMB } from '../lib/model-sizes'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ClearCacheButton() {
  async function handleClick() {
    if (!window.confirm(`Delete ~${totalDownloadMB()} MB of cached index and models? The app will re-download on reload.`)) return
    try {
      await clearAllCachedData()
      window.location.reload()
    } catch (e) {
      console.error('[cache] Failed to clear cached data:', e)
      window.alert('Failed to clear cached data. Check the browser console for details.')
    }
  }
  return <button className="back-btn" onClick={handleClick}>Clear cached data</button>
}

export function Progress() {
  const { stage, substep, progress, error, device, paperCount, indexBuiltAt } = useSearchStore()
  const sizes = currentModelSizes()

  if (stage === 'idle') return <div className="progress">Starting…</div>
  if (stage === 'error') {
    return (
      <div className="progress-error" role="alert">
        <span>Couldn't load Papyrus: {error}</span>
        <div className="actions-right">
          <button className="btn-sm" onClick={() => window.location.reload()}>Retry</button>
          <ClearCacheButton />
        </div>
      </div>
    )
  }
  if (stage === 'ready' || stage === 'searching') {
    return (
      <div className="progress-ready" role="status" aria-live="polite">
        {paperCount.toLocaleString()} papers indexed · running on {device === 'webgpu' ? 'WebGPU' : 'CPU'}
        {indexBuiltAt && ` · index from ${indexBuiltAt}`}
        <div className="actions-right">
          <ClearCacheButton />
        </div>
      </div>
    )
  }

  const stageLabel: Record<string, string> = {
    'loading-index':    `Step 1 of 2 · Loading index (${sizes.index})`,
    'loading-embedder': `Step 2 of 2 · Loading search model (${sizes.embedder})`,
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
      <div role="status" aria-live="polite">
        <div className="progress-stage">{stageLabel[stage] ?? stage}</div>
        {substep && <div className="progress-substep">{substepLabel[substep] ?? substep}</div>}
      </div>
      {progress
        .filter((p) => p.total >= 1024 * 1024) // skip tiny config/tokenizer files — not worth their own bar
        .map((p) => (
          <div key={p.file} className="progress-bar-row">
            <span className="progress-file-name">{p.file.split('/').pop()}</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${p.progress}%` }} />
            </div>
            <span className="progress-amount">{Math.round(p.progress)}% · {formatBytes(p.loaded)} / {formatBytes(p.total)}</span>
          </div>
        ))}
    </div>
  )
}
