/**
 * Geometria do grafo do processo (DFG), com layout próprio.
 *
 * A variante principal (o caminho mais frequente do início ao fim) vira uma espinha reta no
 * centro. As outras atividades ficam nas laterais, à meia altura entre a atividade de onde
 * saem e a atividade para onde seguem, e não numa linha a mais: o desvio vira um arco ao lado
 * da espinha. Cada aresta escolhe por onde sair e chegar (base, topo ou lateral do card)
 * conforme a posição do destino, e as saídas de um mesmo card se espalham pela face.
 */
import type { GraphEdge, GraphNode } from '../../api/types'

export const NODE_W = 176
export const NODE_H = 64
export const CIRC_R = 26
export const START_ID = '__inicio__'
export const END_ID = '__fim__'

export type Layout = 'vertical' | 'horizontal'
export type Pt = { x: number; y: number }
export interface Curve { p0: Pt; p1: Pt; p2: Pt; p3: Pt; mid: Pt }

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
  share: number // 0..1, entre as transições de atividade para atividade
  isSelf: boolean
  /** Volta para uma atividade anterior do fluxo. */
  isBack: boolean
  /** Liga o início ou o fim do caso: não é transição entre atividades. */
  isEndpoint: boolean
  curve: Curve
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

/* ─── layout ─────────────────────────────────────────────────────────── */

/*
 * Espaço canônico: `a` corre no sentido do fluxo e `c` atravessa. No layout vertical a = y e
 * c = x; no horizontal, o contrário. Todo o cálculo é feito nele e convertido só no final.
 */
interface CPt { c: number; a: number }
interface Box extends CPt { id: string; kind: LaidNode['kind']; hc: number; ha: number; col: number }
/** before/after: faces voltadas para o início e para o fim do fluxo; low/high: as duas laterais. */
type Face = 'before' | 'after' | 'low' | 'high'
interface Route { kind: 'straight' | 'sweep' | 'row' | 'elbow' | 'arc'; sFace: Face; tFace: Face }
interface Wire { edge: GraphEdge; id: string; s: Box; t: Box; route: Route; sOff: number; tOff: number; lane: number }
interface Metrics { hc: number; ha: number; rank: number; col: number }

const isSide = (f: Face) => f === 'low' || f === 'high'
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function metrics(layout: Layout): Metrics {
  return layout === 'vertical'
    ? { hc: NODE_W / 2, ha: NODE_H / 2, rank: NODE_H + 96, col: NODE_W + 72 }
    : { hc: NODE_H / 2, ha: NODE_W / 2, rank: NODE_W + 110, col: NODE_H + 64 }
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], layout: Layout): { nodes: LaidNode[]; edges: LaidEdge[] } {
  const m = metrics(layout)
  const vertical = layout === 'vertical'
  const usesStart = edges.some((e) => e.source === START_ID)
  const usesEnd = edges.some((e) => e.target === END_ID)
  const ids = [...(usesStart ? [START_ID] : []), ...nodes.map((n) => n.id), ...(usesEnd ? [END_ID] : [])]
  const known = new Set(ids)
  const real = edges.filter((e) => known.has(e.source) && known.has(e.target))
  const frequency = new Map(nodes.map((n) => [n.id, n.frequency]))
  const boxes = place(ids, real.filter((e) => e.source !== e.target), (id) => frequency.get(id) ?? 0, m)
  const all = [...boxes.values()]

  const wires: Wire[] = real
    .filter((e) => e.source !== e.target)
    .map((edge) => {
      const s = boxes.get(edge.source)!
      const t = boxes.get(edge.target)!
      return { edge, id: `${edge.source}→${edge.target}`, s, t, route: chooseRoute(s, t, all, m), sOff: 0, tOff: 0, lane: 0 }
    })
  assignPorts(wires)
  assignLanes(wires, all)

  const toPt = (p: CPt): Pt => (vertical ? { x: p.c, y: p.a } : { x: p.a, y: p.c })
  const maxNode = Math.max(1, ...nodes.map((n) => n.frequency))
  const laid: LaidNode[] = []
  const corner = (id: string, w: number, h: number) => {
    const p = toPt(boxes.get(id)!)
    return { x: p.x - w / 2, y: p.y - h / 2 }
  }
  if (usesStart) laid.push({ id: START_ID, label: 'Início', kind: 'start', ...corner(START_ID, CIRC_R * 2, CIRC_R * 2), share: 1 })
  if (usesEnd) laid.push({ id: END_ID, label: 'Fim', kind: 'end', ...corner(END_ID, CIRC_R * 2, CIRC_R * 2), share: 1 })
  for (const n of nodes) laid.push({ id: n.id, label: n.label, kind: 'activity', ...corner(n.id, NODE_W, NODE_H), share: n.frequency / maxNode, node: n })

  // a espessura compara só as transições entre atividades; as ligações com início e fim são pontilhadas
  const endpoint = (e: GraphEdge) => e.source === START_ID || e.target === END_ID
  const maxEdge = Math.max(1, ...real.filter((e) => !endpoint(e)).map((e) => e.frequency))
  const byId = new Map(laid.map((n) => [n.id, n]))
  const laidEdges: LaidEdge[] = [
    ...wires.map((w) => {
      const [p0, p1, p2, p3] = wireShape(w).map(toPt)
      // no cotovelo o rótulo fica no trecho reto, longe do canto
      const labelAt = w.route.kind === 'elbow' ? (isSide(w.route.sFace) ? 0.26 : 0.74) : 0.5
      return {
        id: w.id, source: w.edge.source, target: w.edge.target, frequency: w.edge.frequency, share: Math.min(1, w.edge.frequency / maxEdge),
        isSelf: false, isBack: w.t.a < w.s.a - 1, isEndpoint: endpoint(w.edge), curve: { p0, p1, p2, p3, mid: cubicAt(p0, p1, p2, p3, labelAt) },
      }
    }),
    ...real.filter((e) => e.source === e.target).map((e) => ({
      id: `${e.source}→${e.target}`, source: e.source, target: e.target, frequency: e.frequency, share: Math.min(1, e.frequency / maxEdge),
      isSelf: true, isBack: false, isEndpoint: false, curve: selfLoop(byId.get(e.source)!),
    })),
  ]
  return { nodes: laid, edges: laidEdges }
}

/** Posição de cada nó: espinha no centro, o resto à meia altura entre vizinhos, repartido entre os dois lados. */
function place(ids: string[], edges: GraphEdge[], weight: (id: string) => number, m: Metrics): Map<string, Box> {
  const out = new Map<string, GraphEdge[]>()
  const inn = new Map<string, GraphEdge[]>()
  for (const e of edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e])
    inn.set(e.target, [...(inn.get(e.target) ?? []), e])
  }
  const strongest = (list: GraphEdge[] | undefined, key: 'source' | 'target') =>
    list?.length ? list.reduce((best, e) => (e.frequency > best.frequency ? e : best))[key] : undefined

  // espinha: do início, sempre pelo caminho mais frequente ainda não visitado
  const spine: string[] = []
  const seen = new Set<string>()
  const first = ids.includes(START_ID) ? START_ID : [...ids].sort((x, y) => weight(y) - weight(x))[0]
  for (let cur: string | undefined = first; cur !== undefined && !seen.has(cur); ) {
    spine.push(cur)
    seen.add(cur)
    if (cur === END_ID) break
    cur = (out.get(cur) ?? []).filter((e) => !seen.has(e.target)).sort((x, y) => y.frequency - x.frequency)[0]?.target
  }
  if (ids.includes(END_ID) && !seen.has(END_ID)) {
    spine.push(END_ID)
    seen.add(END_ID)
  }

  // nível: cada nó fora da espinha fica entre o vizinho de onde mais chega e o vizinho para onde mais vai
  const rank = new Map<string, number>(spine.map((id, i) => [id, i]))
  const rest = ids.filter((id) => !seen.has(id))
  const last = Math.max(1, spine.length - 1)
  for (const id of rest) rank.set(id, last / 2)
  for (let pass = 0; pass < 40; pass++) {
    for (const id of rest) {
      const from = strongest(inn.get(id), 'source')
      const to = strongest(out.get(id), 'target')
      const rf = from === undefined ? undefined : rank.get(from)
      const rt = to === undefined ? undefined : rank.get(to)
      rank.set(id, rf !== undefined && rt !== undefined ? (rf + rt) / 2 : rf !== undefined ? rf + 0.5 : rt !== undefined ? rt - 0.5 : last / 2)
    }
  }
  for (const id of rest) rank.set(id, clamp(Math.round(rank.get(id)! * 2) / 2, 0.5, last - 0.5))

  // coluna: a mais frequente fica mais perto da espinha; os lados se alternam para equilibrar
  const col = new Map<string, number>(spine.map((id) => [id, 0]))
  const minGap = (2 * m.ha + 20) / m.rank
  const taken = (c: number, r: number) => [...col].some(([id, cc]) => cc === c && Math.abs(rank.get(id)! - r) < minGap)
  const load = new Map<number, number>([[-1, 0], [1, 0]])
  for (const id of [...rest].sort((x, y) => weight(y) - weight(x))) {
    const r = rank.get(id)!
    const neighbour = [strongest(inn.get(id), 'source'), strongest(out.get(id), 'target')]
      .map((n) => (n === undefined ? undefined : col.get(n)))
      .find((c) => c !== undefined && c !== 0)
    const side = neighbour ? Math.sign(neighbour) : load.get(1)! <= load.get(-1)! ? 1 : -1
    let chosen = 0
    for (let d = 1; chosen === 0; d++) {
      for (const sgn of [side, -side]) {
        if (!taken(sgn * d, r)) { chosen = sgn * d; break }
      }
    }
    col.set(id, chosen)
    load.set(Math.sign(chosen), load.get(Math.sign(chosen))! + 1)
  }

  return new Map(ids.map((id) => {
    const circle = id === START_ID || id === END_ID
    const box: Box = {
      id, kind: id === START_ID ? 'start' : id === END_ID ? 'end' : 'activity',
      c: col.get(id)! * m.col, a: rank.get(id)! * m.rank, col: col.get(id)!,
      hc: circle ? CIRC_R : m.hc, ha: circle ? CIRC_R : m.ha,
    }
    return [id, box]
  }))
}

/** Por quais faces a aresta sai e chega, conforme a posição relativa dos dois nós. */
function chooseRoute(s: Box, t: Box, boxes: Box[], m: Metrics): Route {
  const forward = t.a > s.a
  if (s.col === t.col) {
    const lo = Math.min(s.a, t.a)
    const hi = Math.max(s.a, t.a)
    const between = boxes.filter((b) => b !== s && b !== t && b.a > lo && b.a < hi)
    if (forward && !between.some((b) => b.col === s.col)) return { kind: 'straight', sFace: 'after', tFace: 'before' }
    // pula um nó da mesma coluna ou volta: arco pelo lado mais livre
    const count = (sign: number) => between.filter((b) => Math.sign(b.col - s.col) === sign).length
    const sign = count(1) < count(-1) ? 1 : count(-1) < count(1) ? -1 : forward ? -1 : 1
    const face: Face = sign > 0 ? 'high' : 'low'
    return { kind: 'arc', sFace: face, tFace: face }
  }
  const toward = (from: Box, to: Box): Face => (to.c > from.c ? 'high' : 'low')
  if (Math.abs(t.a - s.a) < m.rank * 0.25) return { kind: 'row', sFace: toward(s, t), tFace: toward(t, s) }
  const clearance = forward ? t.a - t.ha - (s.a + s.ha) : -1
  if (clearance >= (m.rank - 2 * m.ha) * 0.6) return { kind: 'sweep', sFace: 'after', tFace: 'before' }
  // nó ao lado, a meia altura: o de dentro usa a lateral e o de fora usa o topo ou a base
  return Math.abs(s.col) <= Math.abs(t.col)
    ? { kind: 'elbow', sFace: toward(s, t), tFace: forward ? 'before' : 'after' }
    : { kind: 'elbow', sFace: forward ? 'after' : 'before', tFace: toward(t, s) }
}

/** Espalha pela face as arestas que usam a mesma face de um nó, na ordem em que os vizinhos aparecem. */
function assignPorts(wires: Wire[]) {
  const groups = new Map<string, { wire: Wire; end: 's' | 't' }[]>()
  for (const wire of wires) {
    for (const end of ['s', 't'] as const) {
      const key = `${wire[end].id}\u0000${end === 's' ? wire.route.sFace : wire.route.tFace}`
      groups.set(key, [...(groups.get(key) ?? []), { wire, end }])
    }
  }
  groups.forEach((list) => {
    const { wire, end } = list[0]
    const box = wire[end]
    const face = end === 's' ? wire.route.sFace : wire.route.tFace
    const pos = (b: Box) => (isSide(face) ? b.a : b.c)
    const other = (x: { wire: Wire; end: 's' | 't' }) => (x.end === 's' ? x.wire.t : x.wire.s)
    list.sort((x, y) => pos(other(x)) - pos(other(y)) || (x.wire.id < y.wire.id ? -1 : 1))
    const half = box.kind === 'activity' ? (isSide(face) ? box.ha * 0.62 : box.hc * 0.56) : CIRC_R * 0.62
    const sep = list.length > 1 ? Math.min(isSide(face) ? 26 : 34, (2 * half) / (list.length - 1)) : 0
    // a aresta alinhada com o nó (a da espinha) fica no centro, para seguir reta
    const aligned = list.findIndex((x) => Math.abs(pos(other(x)) - pos(box)) < 1)
    const base = aligned >= 0 ? aligned : (list.length - 1) / 2
    list.forEach((x, i) => {
      const off = clamp((i - base) * sep, -half, half)
      if (x.end === 's') x.wire.sOff = off
      else x.wire.tOff = off
    })
  })
}

/** Distância do ápice de cada arco lateral: livra os nós daquele lado e cresce com a altura do salto. */
function assignLanes(wires: Wire[], boxes: Box[]) {
  for (const sign of [-1, 1]) {
    const arcs = wires.filter((w) => w.route.kind === 'arc' && (w.route.sFace === 'high' ? 1 : -1) === sign)
    arcs.sort((x, y) => Math.abs(x.t.a - x.s.a) - Math.abs(y.t.a - y.s.a))
    arcs.forEach((w, i) => {
      const lo = Math.min(w.s.a, w.t.a)
      const hi = Math.max(w.s.a, w.t.a)
      const edge = w.s.c + sign * w.s.hc
      const blockers = boxes.filter((b) => b !== w.s && b !== w.t && Math.sign(b.c - w.s.c) === sign && b.a + b.ha > lo && b.a - b.ha < hi)
      const clear = Math.max(0, ...blockers.map((b) => Math.abs(b.c + sign * b.hc - edge) + 26))
      w.lane = Math.max(clear, 52 + (hi - lo) * 0.18) + i * 22
    })
  }
}

function facePoint(b: Box, face: Face, off: number): CPt {
  if (b.kind !== 'activity') {
    const d = Math.sqrt(Math.max(0, CIRC_R * CIRC_R - off * off)) - 1
    if (face === 'before') return { c: b.c + off, a: b.a - d }
    if (face === 'after') return { c: b.c + off, a: b.a + d }
    return { c: b.c + (face === 'high' ? d : -d), a: b.a + off }
  }
  if (face === 'before') return { c: b.c + off, a: b.a - b.ha }
  if (face === 'after') return { c: b.c + off, a: b.a + b.ha }
  return { c: b.c + (face === 'high' ? b.hc : -b.hc), a: b.a + off }
}

/** Pontos de controle da aresta, no espaço canônico. */
function wireShape(w: Wire): [CPt, CPt, CPt, CPt] {
  const p0 = facePoint(w.s, w.route.sFace, w.sOff)
  const p3 = facePoint(w.t, w.route.tFace, w.tOff)
  switch (w.route.kind) {
    case 'row': {
      const d = (p3.c - p0.c) * 0.4
      return [p0, { c: p0.c + d, a: p0.a }, { c: p3.c - d, a: p3.a }, p3]
    }
    case 'elbow': {
      // sai na horizontal pela lateral e chega na vertical pelo topo ou pela base
      const fromSide = isSide(w.route.sFace)
      const side = fromSide ? p0 : p3
      const face = fromSide ? p3 : p0
      // controles perto do canto: trecho reto na saída, canto arredondado e chegada reta, para a ponta não entortar
      const nearSide = { c: side.c + (face.c - side.c) * 0.8, a: side.a }
      const nearFace = { c: face.c, a: face.a + (side.a - face.a) * 0.95 }
      return fromSide ? [p0, nearSide, nearFace, p3] : [p0, nearFace, nearSide, p3]
    }
    case 'arc': {
      const sign = w.route.sFace === 'high' ? 1 : -1
      // o ápice de uma cúbica fica a 3/4 do controle
      const ctrl = (p0.c + p3.c) / 2 + (sign * w.lane) / 0.75
      const d = (p3.a - p0.a) * 0.1
      return [p0, { c: ctrl, a: p0.a + d }, { c: ctrl, a: p3.a - d }, p3]
    }
    default: {
      const d = (p3.a - p0.a) * 0.46
      return [p0, { c: p0.c, a: p0.a + d }, { c: p3.c, a: p3.a - d }, p3]
    }
  }
}

function selfLoop(n: LaidNode): Curve {
  const sy = n.y + NODE_H * 0.28
  const ey = n.y + NODE_H * 0.72
  const lx = n.x + NODE_W + 10
  return { p0: { x: n.x + NODE_W, y: sy }, p1: { x: lx + 52, y: sy - 14 }, p2: { x: lx + 52, y: ey + 14 }, p3: { x: n.x + NODE_W, y: ey }, mid: { x: lx + 54, y: n.y + NODE_H / 2 } }
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
// raiz quadrada: num log real, caminhos de dezenas de casos não somem ao lado de um de milhares
export const freqHalfW = (f: number) => 1.5 + Math.sqrt(f) * 9.0

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
    // a espessura cresce com a distância percorrida, não com o parâmetro: curvas com canto afinam por igual
    const j = (i / N) * ni
    const j0 = Math.floor(j)
    const dist = cum[j0] + (cum[Math.min(S, j0 + 1)] - cum[j0]) * (j - j0)
    const hw = START_HW + (baseHW - START_HW) * (neckDist > 0 ? Math.min(1, dist / neckDist) : 1)
    right.push({ x: p.x + n.x * hw, y: p.y + n.y * hw })
    left.push({ x: p.x - n.x * hw, y: p.y - n.y * hw })
  }
  // a ponta é reta e segue a direção de chegada, mesmo quando a curva vira perto do fim
  const tip = sample(1)
  const tE = tang(1)
  const nE = perp(tE)
  const back = Math.min(headLength, cum[S])
  const pN = { x: tip.x - tE.x * back, y: tip.y - tE.y * back }
  const aR = { x: pN.x + nE.x * headHW, y: pN.y + nE.y * headHW }
  const aL = { x: pN.x - nE.x * headHW, y: pN.y - nE.y * headHW }
  const f = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  return [`M ${f(right[0])}`, ...right.slice(1).map((p) => `L ${f(p)}`), `L ${f(aR)}`, `L ${f(tip)}`, `L ${f(aL)}`, ...left.slice().reverse().map((p) => `L ${f(p)}`), 'Z'].join(' ')
}

export function bounds(nodes: LaidNode[], edges: LaidEdge[] = []) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  // os arcos laterais passam por fora dos nós: entram na conta para o ajuste à tela não cortá-los
  const pts = edges.flatMap((e) => [0.25, 0.5, 0.75].map((t) => cubicAt(e.curve.p0, e.curve.p1, e.curve.p2, e.curve.p3, t)))
  const w = (n: LaidNode) => (n.kind === 'activity' ? NODE_W : CIRC_R * 2)
  const h = (n: LaidNode) => (n.kind === 'activity' ? NODE_H : CIRC_R * 2)
  return {
    minX: Math.min(...nodes.map((n) => n.x), ...pts.map((p) => p.x)) - 60,
    minY: Math.min(...nodes.map((n) => n.y), ...pts.map((p) => p.y)) - 40,
    maxX: Math.max(...nodes.map((n) => n.x + w(n)), ...pts.map((p) => p.x)) + 60,
    maxY: Math.max(...nodes.map((n) => n.y + h(n)), ...pts.map((p) => p.y)) + 40,
  }
}

export function hitTest(n: LaidNode, x: number, y: number) {
  if (n.kind !== 'activity') return Math.hypot(x - (n.x + CIRC_R), y - (n.y + CIRC_R)) <= CIRC_R + 6
  return x >= n.x && x <= n.x + NODE_W && y >= n.y && y <= n.y + NODE_H
}
