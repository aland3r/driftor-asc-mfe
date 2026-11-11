import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { GraphEdge, GraphNode } from '../../api/types'
import { number } from '../../lib/format'
import {
  CIRC_R, NODE_H, NODE_W, PATH_FROM, PATH_MID, PATH_TO,
  CARD_ACCENT, CARD_BASE, activityGlow, activityStripe, arrowPath, bounds, curvePath, freqHalfW, freqOpacity, hitTest, layoutGraph,
  type LaidNode, type Layout,
} from './geometry'
import './graph.css'

const ENDPOINT_STROKE = 'rgba(200,226,245,0.55)'

/** Grafo de sequência direta do processo: arrastar move, roda do mouse aproxima, clique seleciona. */
export function ProcessGraph({ nodes, edges, selectedId, onSelect, highlight }: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  highlight?: Set<string> | null
}) {
  const [layout, setLayout] = useState<Layout>('vertical')
  const laid = useMemo(() => layoutGraph(nodes, edges, layout), [nodes, edges, layout])
  const [view, setView] = useState({ x: 40, y: 40, k: 0.8 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ mx: number; my: number; x: number; y: number; moved: boolean } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const fit = useCallback(() => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = bounds(laid.nodes, laid.edges)
    const k = Math.min(1.1, Math.max(0.25, Math.min((r.width - 40) / (b.maxX - b.minX), (r.height - 40) / (b.maxY - b.minY))))
    setView({ k, x: (r.width - (b.maxX - b.minX) * k) / 2 - b.minX * k, y: Math.max(20, (r.height - (b.maxY - b.minY) * k) / 2) - b.minY * k })
  }, [laid])

  useEffect(() => { fit() }, [fit])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const f = e.deltaY > 0 ? 0.9 : 1.1
      setView((v) => {
        const k = Math.min(3, Math.max(0.2, v.k * f))
        const mx = e.clientX - r.left
        const my = e.clientY - r.top
        return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function toCanvas(cx: number, cy: number) {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }
  }
  function onPointerDown(e: RPointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    drag.current = { mx: e.clientX, my: e.clientY, x: view.x, y: view.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: RPointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.mx
    const dy = e.clientY - d.my
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    setGrabbing(true)
    setView((v) => ({ ...v, x: d.x + dx, y: d.y + dy }))
  }
  function onPointerUp(e: RPointerEvent<SVGSVGElement>) {
    const d = drag.current
    drag.current = null
    setGrabbing(false)
    if (d && !d.moved) {
      const p = toCanvas(e.clientX, e.clientY)
      const hit = laid.nodes.find((n) => hitTest(n, p.x, p.y))
      onSelect(hit && hit.kind === 'activity' ? (hit.id === selectedId ? null : hit.id) : null)
    }
  }

  return (
    <div className="graph">
      <svg
        ref={svgRef}
        className="graph-svg"
        role="img"
        aria-label={`Grafo do processo com ${nodes.length} atividades e ${laid.edges.length} caminhos`}
        style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <pattern id="graph-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.09)" />
          </pattern>
          <linearGradient id="card-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CARD_ACCENT} stopOpacity={0.72} />
            <stop offset="55%" stopColor={CARD_ACCENT} stopOpacity={0.2} />
            <stop offset="100%" stopColor={CARD_ACCENT} stopOpacity={0.06} />
          </linearGradient>
          <marker id="arrow-endpoint" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M 0 1 L 8 4 L 0 7 Z" fill={ENDPOINT_STROKE} />
          </marker>
          <marker id="arrow-back" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M 0 1 L 8 4 L 0 7 Z" fill={PATH_MID} />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#graph-dots)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {laid.edges.map((edge) => {
            const c = edge.curve
            const dimmed = highlight && !(highlight.has(edge.source) && highlight.has(edge.target))
            const opacity = freqOpacity(edge.share) * (dimmed ? 0.25 : 1)
            const label = number(edge.frequency)
            const labelW = Math.max(40, label.length * 8 + 16)
            const labelAlpha = dimmed ? 0.35 : 0.7 + edge.share * 0.3
            if (edge.isEndpoint) {
              // Início e fim não são atividades: ligação pontilhada e fina, como no Disco, sem espessura por frequência
              return (
                <g key={edge.id}>
                  <path d={curvePath(c)} fill="none" stroke={ENDPOINT_STROKE} opacity={dimmed ? 0.3 : 1} strokeWidth={1.4} strokeDasharray="4 4" strokeLinecap="round" markerEnd="url(#arrow-endpoint)" />
                  <EdgeLabel x={c.mid.x} y={c.mid.y} w={labelW} text={label} alpha={dimmed ? 0.35 : 0.8} />
                </g>
              )
            }
            if (edge.isSelf) {
              return (
                <g key={edge.id}>
                  <path d={curvePath(c)} fill="none" stroke={PATH_MID} opacity={opacity * 0.85} strokeWidth={Math.max(1.4, freqHalfW(edge.share) * 0.5)} markerEnd="url(#arrow-back)" />
                  <EdgeLabel x={c.mid.x} y={c.mid.y} w={labelW} text={label} alpha={labelAlpha} />
                </g>
              )
            }
            const gid = `g-${edge.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
            return (
              <g key={edge.id}>
                <defs>
                  <linearGradient id={gid} x1={c.p0.x} y1={c.p0.y} x2={c.p3.x} y2={c.p3.y} gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor={PATH_FROM} />
                    <stop offset="55%" stopColor={PATH_MID} />
                    <stop offset="100%" stopColor={PATH_TO} />
                  </linearGradient>
                </defs>
                <path d={arrowPath(c, freqHalfW(edge.share))} fill={`url(#${gid})`} opacity={opacity} />
                <EdgeLabel x={c.mid.x} y={c.mid.y} w={labelW} text={label} alpha={labelAlpha} />
              </g>
            )
          })}
          {laid.nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={highlight && n.kind === 'activity' && !highlight.has(n.id) ? 0.35 : 1}>
              {n.kind === 'start' && <StartNode layout={layout} />}
              {n.kind === 'end' && <EndNode />}
              {n.kind === 'activity' && <ActivityNode node={n} selected={selectedId === n.id} />}
            </g>
          ))}
        </g>
      </svg>

      <div className="graph-controls">
        <div className="graph-zoom">
          <button type="button" onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} aria-label="Aumentar zoom" title="Aumentar zoom"><ZoomIn size={14} /></button>
          <button type="button" onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k * 0.8) }))} aria-label="Reduzir zoom" title="Reduzir zoom"><ZoomOut size={14} /></button>
          <button type="button" onClick={fit} aria-label="Ajustar à tela" title="Ajustar à tela"><Maximize2 size={14} /></button>
        </div>
        <span className="graph-zoom-pct">{Math.round(view.k * 100)}%</span>
        <button
          type="button"
          className="graph-rotate"
          onClick={() => setLayout((l) => (l === 'vertical' ? 'horizontal' : 'vertical'))}
          aria-label={layout === 'vertical' ? 'Mostrar na horizontal' : 'Mostrar na vertical'}
          title={layout === 'vertical' ? 'Mostrar na horizontal' : 'Mostrar na vertical'}
        >
          <RotateCcw size={14} style={{ transform: layout === 'horizontal' ? 'scaleX(-1)' : 'none' }} />
        </button>
      </div>
    </div>
  )
}

function EdgeLabel({ x, y, w, text, alpha }: { x: number; y: number; w: number; text: string; alpha: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2} y={-11} width={w} height={22} rx={4} fill="rgba(20,28,40,0.92)" stroke="rgba(203,213,225,0.16)" strokeWidth={0.8} />
      <text x={0} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontFamily="'JetBrains Mono',monospace" fill={`rgba(214,224,235,${alpha.toFixed(2)})`}>{text}</text>
    </g>
  )
}

function StartNode({ layout }: { layout: Layout }) {
  const c = CIRC_R
  const play = layout === 'horizontal' ? `${c - 8},${c - 10} ${c + 11},${c} ${c - 8},${c + 10}` : `${c - 10},${c - 8} ${c + 10},${c - 8} ${c},${c + 11}`
  return (
    <g>
      <title>Início</title>
      <circle cx={c} cy={c} r={CIRC_R} fill="#0f3d33" stroke="#10b981" strokeWidth={2} />
      <polygon points={play} fill="#34d399" />
    </g>
  )
}

function EndNode() {
  const c = CIRC_R
  return (
    <g>
      <title>Fim</title>
      <circle cx={c} cy={c} r={CIRC_R} fill="#2b3849" stroke="#94a3b8" strokeWidth={2} />
      <rect x={c - 8} y={c - 8} width={16} height={16} rx={3} fill="#94a3b8" />
    </g>
  )
}

function ActivityNode({ node, selected }: { node: LaidNode; selected: boolean }) {
  const label = node.label.length > 21 ? `${node.label.slice(0, 20)}…` : node.label
  return (
    <g style={{ cursor: 'pointer' }}>
      <title>{`${node.label}: ${number(node.node!.frequency)} execuções`}</title>
      {selected && <rect x={-4} y={-4} width={NODE_W + 8} height={NODE_H + 8} rx={9} fill="rgba(245,158,11,0.08)" stroke="#f59e0b" strokeWidth={1.5} />}
      {/* frequência absoluta da atividade: a faixa do topo e o brilho que desce dela, na escala da legenda */}
      <rect width={NODE_W} height={NODE_H} rx={6} fill={CARD_BASE} />
      <rect width={NODE_W} height={NODE_H} rx={6} fill="url(#card-glow)" opacity={activityGlow(node.share)} />
      <rect width={NODE_W} height={NODE_H} rx={6} fill="none" stroke={activityStripe(node.share)} strokeOpacity={0.22 + node.share * 0.4} />
      <rect width={NODE_W} height={3} rx={1.5} fill={activityStripe(node.share)} />
      <text x={12} y={28} fontSize={13} fontFamily="'Inter',sans-serif" fontWeight={500} fill="#e8eef5">{label}</text>
      <text x={12} y={48} fontSize={12} fontFamily="'JetBrains Mono',monospace" fill={activityStripe(0.6 + node.share * 0.4)}>{number(node.node!.frequency)}</text>
    </g>
  )
}
