import { useEffect, useRef } from 'react'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'
import type { GraphData } from '../types'
import { catColor } from '../lib/categories'

interface GraphViewProps {
  graph: GraphData | null
  onNodeClick: (idx: number, title: string) => void
}

// Loaded lazily (see Results.tsx) so sigma/graphology/forceatlas2 stay out
// of the main bundle until someone actually opens the graph.
export function GraphView({ graph, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const onNodeClickRef = useRef(onNodeClick)

  useEffect(() => {
    onNodeClickRef.current = onNodeClick
  }, [onNodeClick])

  useEffect(() => {
    if (!graph || !containerRef.current) return

    const g = new Graph()
    for (const node of graph.nodes) {
      g.addNode(String(node.idx), {
        label: node.title,
        size: node.isSeed ? 10 : 5,
        color: catColor(node.categories),
        x: Math.random(),
        y: Math.random(),
      })
    }
    for (const edge of graph.edges) {
      const source = String(edge.source)
      const target = String(edge.target)
      if (g.hasNode(source) && g.hasNode(target) && !g.hasEdge(source, target)) {
        g.addEdge(source, target, { weight: edge.weight, size: 1 })
      }
    }

    forceAtlas2.assign(g, { iterations: 150, settings: forceAtlas2.inferSettings(g) })

    const sigma = new Sigma(g, containerRef.current)
    sigmaRef.current = sigma

    sigma.on('clickNode', ({ node }) => {
      const idx = Number(node)
      const found = graph.nodes.find(n => n.idx === idx)
      if (found) onNodeClickRef.current(idx, found.title)
    })

    return () => {
      sigma.kill()
      sigmaRef.current = null
    }
  }, [graph])

  if (!graph) {
    return <div className="graph-loading">Building graph…</div>
  }

  return (
    <div className="graph-view">
      <div className="graph-caption">Similarity map (embedding distance), not citations</div>
      <div ref={containerRef} className="graph-container" />
    </div>
  )
}
