/**
 * Geometria do grafo do processo (DFG): layout com dagre e arestas em forma de
 * seta afunilada, cuja espessura e opacidade seguem a frequência do caminho.
 */
import dagre from '@dagrejs/dagre'
import type { GraphEdge, GraphNode } from '../../api/types'

export const NODE_W = 176
export const NODE_H = 64
export const CIRC_R = 26
export const START_ID = '__inicio__'
export const END_ID = '__fim__'

export type Layout = 'vertical' | 'horizontal'
export type Pt = { x: number; y: number }

export interface LaidNode {
  id: string
  label: string
  kind: 'start' | 'end' | 'activity'
  x: number
  y: number
  share: number // frequência relativa ao nó mais frequente (0..1)
  node?: GraphNode
}

export interface LaidEdge {
  id: string
  source: string
  target: string
  frequency: number
  share: number // 0..1
  isBack: boolean
  isSelf: boolean
  /** Aresta para a frente que pularia por cima de outro nó: contorna pela lateral (-1 esquerda/cima, 1 direita/baixo) até `at`. */
  bypass?: { side: -1 | 1; at: number }
}

/** Acrescenta os nós de início e fim a partir das frequências de início e fim de cada atividade. */
export function withTerminals(nodes: GraphNode[], edges: GraphEdge[]): { edges: GraphEdge[] } {
  const extra: GraphEdge[] = []
  for (const n of nodes) {
    if (n.startFrequency > 0) extra.push({ source: START_ID, target: n.id, frequency: n.startFrequency })
    if (n.endFrequency > 0) extra.push({ source: n.id, target: END_ID, frequency: n.endFrequency })
  }
  return { edges: [...extra, ...edges] }
}

/** Filtra pelos controles de densidade (0..100): atividades mais frequentes e caminhos mais frequentes. */
export function filterByDensity(nodes: GraphNode[], edges: GraphEdge[], activityPct: number, pathPct: number) {
  if (!nodes.length) return { nodes, edges }
  const maxNode = Math.max(...nodes.map((n) => n.frequency))
  const sorted = [...nodes].sort((a, b) => b.frequency - a.frequency)
  const keepCount = Math.max(1, Math.round((activityPct / 100) * nodes.length))
  const kept = new Set(sorted.slice(0, keepCount).map((n) => n.id))
  // mantém também atividades empatadas com a última incluída
  const cutoff = sorted[keepCount - 1]?.frequency ?? maxNode
  for (const n of sorted) if (n.frequency >= cutoff) kept.add(n.id)
  kept.add(START_ID)
  kept.add(END_ID)

  const all = withTerminals(nodes.filter((n) => kept.has(n.id)), edges.filter((e) => kept.has(e.source) && kept.has(e.target))).edges
  if (!all.length) return { nodes: nodes.filter((n) => kept.has(n.id)), edges: [] }
  const maxEdge = Math.max(...all.map((e) => e.frequency))
  const threshold = (1 - pathPct / 100) * maxEdge
  // sempre mantém o caminho mais frequente que sai e que chega em cada nó, para nada ficar solto
  const strongest = new Set<GraphEdge>()
  const bestOut = new Map<string, GraphEdge>()
  const bestIn = new Map<string, GraphEdge>()
  for (const e of all) {
    if (e.source === e.target) continue
    if (!bestOut.has(e.source) || bestOut.get(e.source)!.frequency < e.frequency) bestOut.set(e.source, e)
    if (!bestIn.has(e.target) || bestIn.get(e.target)!.frequency < e.frequency) bestIn.set(e.target, e)
  }
  bestOut.forEach((e) => strongest.add(e))
  bestIn.forEach((e) => strongest.add(e))
  return {
    nodes: nodes.filter((n) => kept.has(n.id)),
    edges: all.filter((e) => e.frequency >= threshold || strongest.has(e)),
  }
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], layout: Layout): { nodes: LaidNode[]; edges: LaidEdge[] } {
  const g = new dagre.graphlib.Graph({ multigraph: false })
  g.setGraph({ rankdir: layout === 'vertical' ? 'TB' : 'LR', nodesep: layout === 'vertical' ? 56 : 40, ranksep: layout === 'vertical' ? 84 : 110, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  const maxNode = Math.max(1, ...nodes.map((n) => n.frequency))
  const usesStart = edges.some((e) => e.source === START_ID)
  const usesEnd = edges.some((e) => e.target === END_ID)
  if (usesStart) g.setNode(START_ID, { width: CIRC_R * 2, height: CIRC_R * 2 })
  if (usesEnd) g.setNode(END_ID, { width: CIRC_R * 2, height: CIRC_R * 2 })
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of edges) if (e.source !== e.target) g.setEdge(e.source, e.target, { weight: e.frequency })
  dagre.layout(g)

  const ids = g.nodes()
  const center = spineLayout(ids, edges, (id) => g.node(id) as { x: number; y: number }, layout)
  const laid: LaidNode[] = []
  const at = (id: string, w: number, h: number) => {
    const c = center.get(id)!
    return { x: c.x - w / 2, y: c.y - h / 2 }
  }
  if (usesStart) laid.push({ id: START_ID, label: 'Início', kind: 'start', ...at(START_ID, CIRC_R * 2, CIRC_R * 2), share: 1 })
  if (usesEnd) laid.push({ id: END_ID, label: 'Fim', kind: 'end', ...at(END_ID, CIRC_R * 2, CIRC_R * 2), share: 1 })
  for (const n of nodes) {
    laid.push({ id: n.id, label: n.label, kind: 'activity', ...at(n.id, NODE_W, NODE_H), share: n.frequency / maxNode, node: n })
  }
  const byId = new Map(laid.map((n) => [n.id, n]))
  const maxEdge = Math.max(1, ...edges.map((e) => e.frequency))
  const laidEdges: LaidEdge[] = edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => {
      const s = byId.get(e.source)!
      const t = byId.get(e.target)!
      const isSelf = e.source === e.target
      // o dagre inverte arestas de ciclos: o destino fica antes da origem
      const isBack = !isSelf && (layout === 'vertical' ? t.y < s.y : t.x < s.x)
      const bypass = isSelf || isBack ? undefined : findBypass(s, t, laid, layout)
      return { id: `${e.source}→${e.target}`, source: e.source, target: e.target, frequency: e.frequency, share: e.frequency / maxEdge, isBack, isSelf, bypass }
    })
  return { nodes: laid, edges: laidEdges }
}

/*
 * Espinha central: a variante principal (o caminho mais frequente do início ao fim) fica numa
 * coluna reta no centro, e as outras atividades de cada nível vão para as laterais, da mais
 * próxima para a mais distante, do lado em que o dagre já as tinha posto. Assim as setas
 * grossas seguem retas e as raras fazem as curvas.
 */
function spineLayout(ids: string[], edges: GraphEdge[], dagrePos: (id: string) => Pt, layout: Layout): Map<string, Pt> {
  const vertical = layout === 'vertical'
  const along = (id: string) => (vertical ? dagrePos(id).y : dagrePos(id).x)
  const cross = (id: string) => (vertical ? dagrePos(id).x : dagrePos(id).y)
  const step = vertical ? NODE_W + 48 : NODE_H + 40

  const out = new Map<string, GraphEdge[]>()
  for (const e of edges) if (e.source !== e.target) out.set(e.source, [...(out.get(e.source) ?? []), e])
  const first = ids.includes(START_ID) ? START_ID : [...ids].sort((a, b) => along(a) - along(b))[0]
  const spine = new Set<string>()
  for (let cur: string | undefined = first; cur && !spine.has(cur); ) {
    spine.add(cur)
    const next: GraphEdge | undefined = (out.get(cur) ?? [])
      .filter((e) => along(e.target) > along(cur!) && !spine.has(e.target))
      .sort((a, b) => b.frequency - a.frequency)[0]
    cur = next?.target
  }
  const spineCross = [...spine].map(cross)
  const mid = spineCross.length ? spineCross.reduce((a, b) => a + b, 0) / spineCross.length : 0

  const ranks = new Map<number, string[]>()
  for (const id of ids) {
    const r = Math.round(along(id))
    ranks.set(r, [...(ranks.get(r) ?? []), id])
  }
  const result = new Map<string, Pt>()
  const place = (id: string, c: number) => result.set(id, vertical ? { x: c, y: along(id) } : { x: along(id), y: c })
  ranks.forEach((members) => {
    const axis = members.find((id) => spine.has(id))
    const ref = axis ? cross(axis) : mid
    if (axis) place(axis, 0)
    // mantém a ordem do dagre (menos cruzamentos) e reparte os nós entre os dois lados
    const rest = members.filter((id) => id !== axis).sort((a, b) => cross(a) - cross(b))
    const natural = rest.filter((id) => cross(id) - ref < -1).length + Math.floor(rest.filter((id) => Math.abs(cross(id) - ref) <= 1).length / 2)
    const k = Math.min(Math.ceil(rest.length / 2), Math.max(Math.floor(rest.length / 2), natural))
    const left = rest.slice(0, k)
    const right = rest.slice(k)
    // com a coluna central livre, um nó de um lado só fica a um passo dela
    left.reverse().forEach((id, i) => place(id, -(i + 1) * step))
    right.forEach((id, i) => place(id, (i + 1) * step))
  })
  return result
}

/** Se a ligação direta entre dois níveis passaria por cima de outro nó, contorna pelo lado mais livre. */
function findBypass(s: LaidNode, t: LaidNode, nodes: LaidNode[], layout: Layout): LaidEdge['bypass'] {
  const vertical = layout === 'vertical'
  const lo = (n: LaidNode) => (vertical ? n.y : n.x)
  const hi = (n: LaidNode) => lo(n) + (vertical ? height(n) : width(n))
  const c0 = (n: LaidNode) => (vertical ? n.x : n.y)
  const c1 = (n: LaidNode) => c0(n) + (vertical ? width(n) : height(n))
  const sc = (c0(s) + c1(s)) / 2
  const tc = (c0(t) + c1(t)) / 2
  const from = hi(s)
  const to = lo(t)
  const between = nodes.filter((n) => n !== s && n !== t && lo(n) > from - 1 && hi(n) < to + 1)
  const blocked = between.some((n) => {
    const k = (lo(n) + hi(n)) / 2
    const f = (k - from) / Math.max(1, to - from)
    const c = sc + (tc - sc) * f
    return c > c0(n) - 12 && c < c1(n) + 12
  })
  if (!blocked) return undefined
  const lowEdge = Math.min(c0(s), c0(t), ...between.map(c0))
  const highEdge = Math.max(c1(s), c1(t), ...between.map(c1))
  const side: -1 | 1 = Math.abs(sc - lowEdge) <= Math.abs(highEdge - sc) ? -1 : 1
  return { side, at: side < 0 ? lowEdge - 36 : highEdge + 36 }
}

/* ─── curvas ─────────────────────────────────────────────────────────── */

function norm(v: Pt): Pt { const l = Math.hypot(v.x, v.y); return l < 1e-9 ? { x: 0, y: 1 } : { x: v.x / l, y: v.y / l } }
function perp(t: Pt): Pt { return { x: -t.y, y: t.x } }
function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const m = 1 - t
  return { x: m * m * m * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t * t * t * p3.x, y: m * m * m * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t * t * t * p3.y }
}
function cubicTang(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const m = 1 - t
  return norm({ x: 3 * (m * m * (p1.x - p0.x) + 2 * m * t * (p2.x - p1.x) + t * t * (p3.x - p2.x)), y: 3 * (m * m * (p1.y - p0.y) + 2 * m * t * (p2.y - p1.y) + t * t * (p3.y - p2.y)) })
}

export const GRAD_LIGHT = '#c8e2f5'
export const GRAD_MID = '#4d8fc0'
export const GRAD_DEEP = '#2870a8'
export const freqOpacity = (f: number) => 0.42 + f * 0.53
export const freqHalfW = (f: number) => 1.5 + f * 9.0

export interface Curve { p0: Pt; p1: Pt; p2: Pt; p3: Pt; mid: Pt }

function srcPoint(n: LaidNode, layout: Layout): Pt {
  if (n.kind !== 'activity') return layout === 'horizontal' ? { x: n.x + CIRC_R * 2 - 4, y: n.y + CIRC_R } : { x: n.x + CIRC_R, y: n.y + CIRC_R * 2 - 4 }
  return layout === 'horizontal' ? { x: n.x + NODE_W, y: n.y + NODE_H / 2 } : { x: n.x + NODE_W / 2, y: n.y + NODE_H }
}
function tgtPoint(n: LaidNode, layout: Layout): Pt {
  if (n.kind !== 'activity') return layout === 'horizontal' ? { x: n.x + 4, y: n.y + CIRC_R } : { x: n.x + CIRC_R, y: n.y + 4 }
  return layout === 'horizontal' ? { x: n.x, y: n.y + NODE_H / 2 } : { x: n.x + NODE_W / 2, y: n.y }
}
const height = (n: LaidNode) => (n.kind === 'activity' ? NODE_H : CIRC_R * 2)
const width = (n: LaidNode) => (n.kind === 'activity' ? NODE_W : CIRC_R * 2)

/** Pontos de controle de uma aresta; o deslocamento separa arestas paralelas. */
export function edgeCurve(src: LaidNode, tgt: LaidNode, layout: Layout, isBack: boolean, lane = 0, bypass?: LaidEdge['bypass']): Curve {
  if (src.id === tgt.id) {
    const sy = src.y + NODE_H * 0.28
    const ey = src.y + NODE_H * 0.72
    const lx = src.x + NODE_W + 10
    return { p0: { x: src.x + NODE_W, y: sy }, p1: { x: lx + 52, y: sy - 14 }, p2: { x: lx + 52, y: ey + 14 }, p3: { x: src.x + NODE_W, y: ey }, mid: { x: lx + 54, y: src.y + NODE_H / 2 } }
  }
  if (isBack) {
    // A volta contorna pelo lado em que a origem está: origem à direita do destino volta pela direita
    // (abaixo, no layout horizontal), para a ligação não cruzar o grafo.
    if (layout === 'horizontal') {
      const below = src.y + height(src) / 2 > tgt.y + height(tgt) / 2 + 1
      const s = { x: src.x + width(src) / 2, y: below ? src.y + height(src) : src.y }
      const e = { x: tgt.x + width(tgt) / 2, y: below ? tgt.y + height(tgt) : tgt.y }
      const off = 70 + Math.abs(e.x - s.x) * 0.08 + lane * 18
      const arcY = below ? Math.max(s.y, e.y) + off : Math.min(s.y, e.y) - off
      return { p0: s, p1: { x: s.x, y: arcY }, p2: { x: e.x, y: arcY }, p3: e, mid: { x: (s.x + e.x) / 2, y: arcY + (below ? -4 : 4) } }
    }
    const right = src.x + width(src) / 2 > tgt.x + width(tgt) / 2 + 1
    const s = { x: right ? src.x + width(src) : src.x, y: src.y + height(src) / 2 }
    const e = { x: right ? tgt.x + width(tgt) : tgt.x, y: tgt.y + height(tgt) / 2 }
    const off = 70 + Math.abs(s.y - e.y) * 0.12 + lane * 18
    const sideX = right ? Math.max(s.x, e.x) + off : Math.min(s.x, e.x) - off
    return { p0: s, p1: { x: sideX, y: s.y }, p2: { x: sideX, y: e.y }, p3: e, mid: { x: sideX + (right ? -14 : 14), y: (s.y + e.y) / 2 } }
  }
  if (bypass) {
    // sai pela lateral da origem, corre por fora dos nós do meio e entra pela lateral do destino
    if (layout === 'horizontal') {
      const s = { x: src.x + width(src) / 2, y: bypass.side < 0 ? src.y : src.y + height(src) }
      const e = { x: tgt.x + width(tgt) / 2, y: bypass.side < 0 ? tgt.y : tgt.y + height(tgt) }
      return { p0: s, p1: { x: s.x, y: bypass.at }, p2: { x: e.x, y: bypass.at }, p3: e, mid: { x: (s.x + e.x) / 2, y: bypass.at } }
    }
    const s = { x: bypass.side < 0 ? src.x : src.x + width(src), y: src.y + height(src) / 2 }
    const e = { x: bypass.side < 0 ? tgt.x : tgt.x + width(tgt), y: tgt.y + height(tgt) / 2 }
    return { p0: s, p1: { x: bypass.at, y: s.y }, p2: { x: bypass.at, y: e.y }, p3: e, mid: { x: bypass.at + bypass.side * -6, y: (s.y + e.y) / 2 } }
  }
  const s = srcPoint(src, layout)
  const e = tgtPoint(tgt, layout)
  if (layout === 'horizontal') {
    const dx = Math.abs(e.x - s.x) * 0.46
    return { p0: s, p1: { x: s.x + dx, y: s.y }, p2: { x: e.x - dx, y: e.y }, p3: e, mid: { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 } }
  }
  const dy = Math.abs(e.y - s.y) * 0.46
  return { p0: s, p1: { x: s.x, y: s.y + dy }, p2: { x: e.x, y: e.y - dy }, p3: e, mid: { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 } }
}

export function curvePath(c: Curve): string {
  return `M ${c.p0.x},${c.p0.y} C ${c.p1.x},${c.p1.y} ${c.p2.x},${c.p2.y} ${c.p3.x},${c.p3.y}`
}

/** Seta afunilada: quase um ponto na origem, corpo cheio no pescoço e ponta com ângulo de ~30°. */
export function arrowPath(c: Curve, baseHW: number, N = 32): string {
  const sample = (t: number) => cubicAt(c.p0, c.p1, c.p2, c.p3, t)
  const tang = (t: number) => cubicTang(c.p0, c.p1, c.p2, c.p3, t)
  const START_HW = 0.4
  const headHW = baseHW * 1.8
  const headLength = headHW * 1.6
  const S = N * 2
  const pts = Array.from({ length: S + 1 }, (_, i) => sample(i / S))
  const cum = [0]
  for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const neckDist = Math.max(0, cum[S] - headLength)
  let ni = S
  for (let i = 1; i <= S; i++) if (cum[i] >= neckDist) { ni = i; break }
  const NECK = ni / S
  const right: Pt[] = []
  const left: Pt[] = []
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * NECK
    const p = sample(t)
    const n = perp(tang(t))
    const hw = START_HW + (baseHW - START_HW) * (i / N)
    right.push({ x: p.x + n.x * hw, y: p.y + n.y * hw })
    left.push({ x: p.x - n.x * hw, y: p.y - n.y * hw })
  }
  const pN = sample(NECK)
  const nN = perp(tang(NECK))
  const aR = { x: pN.x + nN.x * headHW, y: pN.y + nN.y * headHW }
  const aL = { x: pN.x - nN.x * headHW, y: pN.y - nN.y * headHW }
  const tip = sample(1)
  const f = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  return [`M ${f(right[0])}`, ...right.slice(1).map((p) => `L ${f(p)}`), `L ${f(aR)}`, `L ${f(tip)}`, `L ${f(aL)}`, ...left.slice().reverse().map((p) => `L ${f(p)}`), 'Z'].join(' ')
}

export function bounds(nodes: LaidNode[]) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return {
    minX: Math.min(...nodes.map((n) => n.x)) - 90,
    minY: Math.min(...nodes.map((n) => n.y)) - 40,
    maxX: Math.max(...nodes.map((n) => n.x + width(n))) + 90,
    maxY: Math.max(...nodes.map((n) => n.y + height(n))) + 40,
  }
}

export function hitTest(n: LaidNode, x: number, y: number) {
  if (n.kind !== 'activity') return Math.hypot(x - (n.x + CIRC_R), y - (n.y + CIRC_R)) <= CIRC_R + 6
  return x >= n.x && x <= n.x + NODE_W && y >= n.y && y <= n.y + NODE_H
}
