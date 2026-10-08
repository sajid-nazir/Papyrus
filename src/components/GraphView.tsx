import { useEffect, useRef, useState } from 'react'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'
import type { GraphData } from '../types'
import { catColor, catClass, catShortName } from '../lib/categories'

interface GraphViewProps {
  graph: GraphData | null
  onNodeClick: (idx: number, title: string) => void
}

interface HoverInfo {
  title: string
  categories: string
}

// Truncates at a word boundary rather than mid-word where possible, so
// on-canvas labels read as short phrases instead of cut-off fragments.
function truncateTitle(title: string, max = 28): string {
  if (title.length <= max) return title
  const cut = title.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > 15 ? cut.slice(0, lastSpace) : cut
  return `${base}…`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3
    ? normalized.split('').map(c => c + c).join('')
    : normalized
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

// Loaded lazily (see Results.tsx) so sigma/graphology/forceatlas2 stay out
// of the main bundle until someone actually opens the graph.
export function GraphView({ graph, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const onNodeClickRef = useRef(onNodeClick)
  const [hovered, setHovered] = useState<HoverInfo | null>(null)

  useEffect(() => {
    onNodeClickRef.current = onNodeClick
  }, [onNodeClick])

  useEffect(() => {
    if (!graph || !containerRef.current) return
    const container = containerRef.current

    // Canvas rendering can't read CSS custom properties, so resolve the
    // ones we need once up front. Picks up whichever theme is active when
    // the graph opens; doesn't react to a live OS theme change mid-session
    // (reopening the graph does).
    const rootStyle = getComputedStyle(document.documentElement)
    const textColor = rootStyle.getPropertyValue('--text').trim()
    const textMutedColor = rootStyle.getPropertyValue('--text-muted').trim()
    const borderLightColor = rootStyle.getPropertyValue('--border-light').trim()
    const mutedRgb = hexToRgb(textMutedColor)

    const g = new Graph()
    const n = graph.nodes.length
    graph.nodes.forEach((node, i) => {
      g.addNode(String(node.idx), {
        label: truncateTitle(node.title),
        size: node.isSeed ? 10 : 5,
        color: catColor(node.categories),
        // Deterministic initial layout (a point on a circle, in node order)
        // instead of Math.random() — forceAtlas2 then converges to the same
        // picture each time the same result set is graphed, rather than
        // reshuffling on every open.
        x: Math.cos((i * 2 * Math.PI) / n),
        y: Math.sin((i * 2 * Math.PI) / n),
      })
    })

    const weights = graph.edges.map(e => e.weight)
    const minWeight = Math.min(...weights)
    const weightRange = Math.max(...weights) - minWeight || 1
    for (const edge of graph.edges) {
      const source = String(edge.source)
      const target = String(edge.target)
      if (g.hasNode(source) && g.hasNode(target) && !g.hasEdge(source, target)) {
        // Encode similarity as opacity, not thickness — sigma clamps edge
        // thickness below ~1.7px (minEdgeThickness), so thickness alone
        // can't distinguish this graph's fairly narrow weight range.
        const t = (edge.weight - minWeight) / weightRange
        const alpha = 0.12 + 0.43 * t
        g.addEdge(source, target, {
          weight: edge.weight,
          size: 1,
          color: `rgba(${mutedRgb.r}, ${mutedRgb.g}, ${mutedRgb.b}, ${alpha})`,
        })
      }
    }

    forceAtlas2.assign(g, { iterations: 150, settings: forceAtlas2.inferSettings(g) })

    // Plain closure variable, not React state — reducers run on every
    // frame and must not trigger re-renders of this component.
    let hoveredNode: string | null = null

    const sigma = new Sigma(g, container, {
      labelRenderedSizeThreshold: 8,
      labelSize: 11,
      labelFont: 'system-ui, sans-serif',
      labelColor: { color: textMutedColor },
      labelDensity: 0.5,
      enableCameraRotation: false,
      minCameraRatio: 0.1,
      maxCameraRatio: 2,
      stagePadding: 24,
      defaultEdgeColor: `rgba(${mutedRgb.r}, ${mutedRgb.g}, ${mutedRgb.b}, 0.2)`,
      nodeReducer: (node, data) => {
        if (!hoveredNode) return data
        if (node === hoveredNode) return { ...data, highlighted: true }
        if (g.areNeighbors(node, hoveredNode)) return { ...data, forceLabel: true }
        return { ...data, color: borderLightColor, label: '' }
      },
      edgeReducer: (edge, data) => {
        if (hoveredNode && !g.extremities(edge).includes(hoveredNode)) {
          return { ...data, hidden: true }
        }
        return data
      },
      defaultDrawNodeHover: (context, data, settings) => {
        context.beginPath()
        context.arc(data.x, data.y, data.size + 2, 0, Math.PI * 2)
        context.strokeStyle = textColor
        context.lineWidth = 1.5
        context.stroke()
        context.font = `${settings.labelSize}px ${settings.labelFont}`
        context.fillStyle = textColor
        context.fillText(data.label ?? '', data.x + data.size + 4, data.y + 4)
      },
    })
    sigmaRef.current = sigma

    sigma.on('clickNode', ({ node }) => {
      const idx = Number(node)
      const found = graph.nodes.find(n => n.idx === idx)
      if (found) onNodeClickRef.current(idx, found.title)
    })

    sigma.on('enterNode', ({ node }) => {
      hoveredNode = node
      container.style.cursor = 'pointer'
      const found = graph.nodes.find(n => String(n.idx) === node)
      if (found) setHovered({ title: found.title, categories: found.categories })
      sigma.refresh({ skipIndexation: true })
    })
    sigma.on('leaveNode', () => {
      hoveredNode = null
      container.style.cursor = ''
      setHovered(null)
      sigma.refresh({ skipIndexation: true })
    })

    // Sigma's own wheel handler calls preventDefault() whenever it zooms,
    // which also blocks the page from scrolling if the cursor happens to be
    // over the graph. Stop the event from reaching sigma's canvas unless a
    // zoom gesture (ctrl/cmd, which is also how trackpad pinch arrives) is
    // intended, without preventDefault — so the page scroll still happens.
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    }
    container.addEventListener('wheel', handleWheel, { capture: true })

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true })
      sigma.kill()
      sigmaRef.current = null
    }
  }, [graph])

  if (!graph) {
    return <div className="graph-loading">Building graph…</div>
  }

  // One legend entry per category actually present in this graph, keeping
  // the raw categories string so catColor/catShortName (which both key off
  // a paper's categories field, not a plain class name) resolve correctly.
  const legendEntries = Array.from(
    new Map(graph.nodes.map(node => [catClass(node.categories), node.categories])).entries()
  )

  return (
    <div className="graph-view">
      <div className="graph-caption">
        {hovered ? (
          <>
            <span className="graph-caption-title">{hovered.title}</span>
            <span className="graph-caption-meta">
              {hovered.categories.split(' ')[0]} · click to find similar
            </span>
          </>
        ) : (
          <>
            <span>Similarity map (embedding distance), not citations</span>
            <span className="graph-legend">
              {legendEntries.length > 1 && legendEntries.map(([cls, categories]) => (
                <span key={cls} className="graph-legend-item">
                  <span className="graph-legend-dot" style={{ background: catColor(categories) }} />
                  {catShortName(categories)}
                </span>
              ))}
              <span className="graph-legend-item">
                <span className="graph-legend-dot graph-legend-dot-seed" />
                seed
              </span>
            </span>
          </>
        )}
      </div>
      <div ref={containerRef} className="graph-container" />
      <button
        className="graph-reset-btn"
        onClick={() => sigmaRef.current?.getCamera().animatedReset()}
      >
        Reset
      </button>
    </div>
  )
}
