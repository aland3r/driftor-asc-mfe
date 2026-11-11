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
interface Route { kind: 'straight' | 'sweep' | 'row' | 'elbow' | 'arc' | 'radial'; sFace: Face; tFace: Face }
/** sOff e tOff: deslocamento ao longo da face do card; num círculo, o ângulo em volta dele. */
interface Wire { edge: GraphEdge; id: string; s: Box; t: Box; route: Route; sOff: number; tOff: number; lane: number }
interface Metrics { hc: number; ha: number; rank: number; col: number }

const isSide = (f: Face) => f === 'low' || f === 'high'
const isCircle = (b: Box) => b.kind !== 'activity'
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Folga entre a ponta da seta e a borda do elemento em que ela chega. */
const TIP_GAP = 4

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
      const [p0, p1, p2, p3] = wireShape(w, all).map(toPt)
      // na curva de canto o rótulo fica perto da origem, onde a seta ainda é fina, e deixa a curva e a ponta à vista
      const labelAt = w.route.kind === 'elbow' ? 0.24 : 0.5
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
  // início e fim são círculos: a ligação chega na direção de onde vem, em volta da circunferência
  if (isCircle(s) || isCircle(t)) {
    const act = isCircle(s) ? t : s
    const circ = isCircle(s) ? s : t
    const room = isCircle(s) ? act.a - act.ha - (circ.a + CIRC_R) : circ.a - CIRC_R - (act.a + act.ha)
    const face: Face = room > 8 ? (isCircle(s) ? 'before' : 'after') : toward(act, circ)
    return { kind: 'radial', sFace: isCircle(s) ? 'after' : face, tFace: isCircle(s) ? face : 'before' }
  }
  if (Math.abs(t.a - s.a) < m.rank * 0.25) return { kind: 'row', sFace: toward(s, t), tFace: toward(t, s) }
  const clearance = forward ? t.a - t.ha - (s.a + s.ha) : -1
  if (clearance >= (m.rank - 2 * m.ha) * 0.6) return { kind: 'sweep', sFace: 'after', tFace: 'before' }
  // nó ao lado, a meia altura. Descendo, sai pela lateral e chega pelo topo, que tem mais espaço que a lateral
  if (forward) return { kind: 'elbow', sFace: toward(s, t), tFace: 'before' }
  // voltando, o de dentro usa a lateral e o de fora usa o topo ou a base
  return Math.abs(s.col) <= Math.abs(t.col)
    ? { kind: 'elbow', sFace: toward(s, t), tFace: 'after' }
    : { kind: 'elbow', sFace: 'before', tFace: toward(t, s) }
}

/** Onde a ponta da aresta gostaria de ficar: no centro quando o vizinho está em linha, perto do canto quando está de lado. */
function idealPort(box: Box, other: Box, face: Face, kind: Route['kind'], half: number): number {
  if (kind === 'straight') return 0
  if (isCircle(box)) {
    if (kind === 'arc') return face === 'high' ? Math.PI / 2 : -Math.PI / 2
    // ângulo de onde o vizinho aparece, medido a partir do sentido do fluxo
    return clamp(Math.atan2(other.c - box.c, Math.max(1, Math.abs(other.a - box.a) - other.ha)), -half, half)
  }
  if (isSide(face)) {
    const toward = Math.sign(other.a - box.a)
    return kind === 'arc' ? toward * half * 0.7 : 0
  }
  // topo ou base: quanto mais de lado e mais perto está o vizinho, mais a ponta vai para o canto
  const across = other.c - box.c
  const gap = Math.max(0, Math.abs(other.a - box.a) - box.ha - other.ha)
  return Math.abs(across) < 1 ? 0 : Math.sign(across) * half * (Math.abs(across) / (Math.abs(across) + 1.6 * gap))
}

/** Ajusta posições já ordenadas para caberem em [lo, hi] com uma distância mínima, mexendo o menos possível. */
function fit(ideal: number[], lo: number, hi: number, sep: number): number[] {
  const n = ideal.length
  if (!n) return []
  const s = n > 1 ? Math.max(0, Math.min(sep, (hi - lo) / (n - 1))) : 0
  let x = [...ideal]
  for (let i = 1; i < n; i++) x[i] = Math.max(x[i], x[i - 1] + s)
  const mean = (v: number[]) => v.reduce((sum, k) => sum + k, 0) / v.length
  const shift = mean(ideal) - mean(x)
  x = x.map((v) => v + shift)
  x[n - 1] = Math.min(x[n - 1], hi)
  for (let i = n - 2; i >= 0; i--) x[i] = Math.min(x[i], x[i + 1] - s)
  x[0] = Math.max(x[0], lo)
  for (let i = 1; i < n; i++) x[i] = Math.max(x[i], x[i - 1] + s)
  return x
}

/**
 * Distribui as pontas que dividem a mesma face de um card, ou o mesmo círculo: cada uma perto de
 * onde gostaria de ficar, sem encostar na vizinha. A ligação reta da espinha fica fixa no centro.
 */
function assignPorts(wires: Wire[]) {
  type End = { wire: Wire; end: 's' | 't'; ideal: number; sort: number }
  const groups = new Map<string, { box: Box; face: Face; half: number; ends: End[] }>()
  for (const wire of wires) {
    for (const end of ['s', 't'] as const) {
      const box = wire[end]
      const other = end === 's' ? wire.t : wire.s
      const face = end === 's' ? wire.route.sFace : wire.route.tFace
      const key = isCircle(box) ? box.id : `${box.id}\u0000${face}`
      const half = isCircle(box) ? Math.PI / 2 : (isSide(face) ? box.ha : box.hc) * 0.6
      const group = groups.get(key) ?? { box, face, half, ends: [] }
      group.ends.push({ wire, end, ideal: idealPort(box, other, face, wire.route.kind, half), sort: isSide(face) && !isCircle(box) ? other.a : other.c })
      groups.set(key, group)
    }
  }
  groups.forEach(({ box, face, half, ends }) => {
    ends.sort((x, y) => x.ideal - y.ideal || x.sort - y.sort || (x.wire.id < y.wire.id ? -1 : 1))
    const sep = isCircle(box) ? 0.46 : isSide(face) ? 22 : 30
    const pinned = ends.findIndex((x) => x.wire.route.kind === 'straight')
    const ideal = ends.map((x) => x.ideal)
    let offs: number[]
    if (pinned < 0) offs = fit(ideal, -half, half, sep)
    else {
      const left = ideal.slice(0, pinned)
      const right = ideal.slice(pinned + 1)
      const sl = Math.min(sep, half / Math.max(1, left.length))
      const sr = Math.min(sep, half / Math.max(1, right.length))
      offs = [...fit(left, -half, -sl, sl), 0, ...fit(right, sr, half, sr)]
    }
    ends.forEach((x, i) => {
      if (x.end === 's') x.wire.sOff = offs[i]
      else x.wire.tOff = offs[i]
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

/** Ponto em que a aresta toca o nó e a direção que aponta para fora dele. */
function endPoint(b: Box, face: Face, off: number, gap: number): { p: CPt; n: CPt } {
  if (isCircle(b)) {
    // o fim recebe pelo lado de onde o fluxo vem; o início solta para o lado aonde o fluxo vai
    const n = { c: Math.sin(off), a: (b.kind === 'end' ? -1 : 1) * Math.cos(off) }
    return { p: { c: b.c + n.c * (CIRC_R + gap), a: b.a + n.a * (CIRC_R + gap) }, n }
  }
  if (face === 'before') return { p: { c: b.c + off, a: b.a - b.ha - gap }, n: { c: 0, a: -1 } }
  if (face === 'after') return { p: { c: b.c + off, a: b.a + b.ha + gap }, n: { c: 0, a: 1 } }
  const sign = face === 'high' ? 1 : -1
  return { p: { c: b.c + sign * (b.hc + gap), a: b.a + off }, n: { c: sign, a: 0 } }
}

/** Inclina a direção de saída de uma face para o lado em que o outro nó está, em `deg` graus. */
function lean(n: CPt, towardC: number, towardA: number, deg: number): CPt {
  const side = -n.a * towardC + n.c * towardA >= 0 ? 1 : -1
  const t = { c: -n.a * side, a: n.c * side }
  const r = (deg * Math.PI) / 180
  return { c: n.c * Math.cos(r) + t.c * Math.sin(r), a: n.a * Math.cos(r) + t.a * Math.sin(r) }
}

type Shape = [CPt, CPt, CPt, CPt]

/** A primeira das curvas que não passa por cima de nenhum outro card; se todas passam, a preferida. */
function firstClear(options: Shape[], w: Wire, boxes: Box[]): Shape {
  const others = boxes.filter((b) => b !== w.s && b !== w.t)
  const at = ([p0, p1, p2, p3]: Shape, t: number, k: 'c' | 'a') => {
    const m = 1 - t
    return m * m * m * p0[k] + 3 * m * m * t * p1[k] + 3 * m * t * t * p2[k] + t * t * t * p3[k]
  }
  const crosses = (shape: Shape) => {
    for (let i = 1; i < 24; i++) {
      const c = at(shape, i / 24, 'c')
      const a = at(shape, i / 24, 'a')
      if (others.some((b) => Math.abs(c - b.c) < b.hc + 8 && Math.abs(a - b.a) < b.ha + 8)) return true
    }
    return false
  }
  return options.find((o) => !crosses(o)) ?? options[0]
}

/** Pontos de controle da aresta, no espaço canônico. */
function wireShape(w: Wire, boxes: Box[]): Shape {
  const { p: p0, n: n0 } = endPoint(w.s, w.route.sFace, w.sOff, isCircle(w.s) ? 1 : 0)
  const { p: p3, n: n3 } = endPoint(w.t, w.route.tFace, w.tOff, TIP_GAP)
  const out = (p: CPt, n: CPt, k: number): CPt => ({ c: p.c + n.c * k, a: p.a + n.a * k })
  const dc = p3.c - p0.c
  const da = p3.a - p0.a
  switch (w.route.kind) {
    case 'elbow': {
      // curva curta e aberta: sai quase reta da lateral e chega inclinada perto do canto, sem dobrar em ângulo reto
      const d0 = lean(n0, dc, da, isSide(w.route.sFace) ? 12 : 36)
      const d3 = lean(n3, -dc, -da, isSide(w.route.tFace) ? 12 : 36)
      // as duas direções se cruzam num ponto: com os controles a caminho dele a curva sai sempre convexa
      const det = d0.c * -d3.a - d0.a * -d3.c
      const u = Math.abs(det) > 1e-6 ? (dc * -d3.a - da * -d3.c) / det : -1
      const v = Math.abs(det) > 1e-6 ? (d0.c * da - d0.a * dc) / det : -1
      if (u > 0 && v > 0) return [p0, out(p0, d0, u * 0.62), out(p3, d3, v * 0.62), p3]
      const k = 0.58
      return [p0, out(p0, n0, k * Math.abs(dc * n0.c + da * n0.a)), out(p3, n3, k * Math.abs(dc * n3.c + da * n3.a)), p3]
    }
    case 'arc': {
      const sign = w.route.sFace === 'high' ? 1 : -1
      // o ápice de uma cúbica fica a 3/4 do controle
      const ctrl = (p0.c + p3.c) / 2 + (sign * w.lane) / 0.75
      const d = da * 0.1
      return [p0, { c: ctrl, a: p0.a + d }, { c: ctrl, a: p3.a - d }, p3]
    }
    case 'radial': {
      // sai do card já inclinada para o círculo e chega apontando para o centro dele, sem fazer barriga
      const fromCircle = isCircle(w.s)
      const [circ, cn, act, face] = fromCircle ? [p0, n0, p3, n3] : [p3, n3, p0, n0]
      const dist = Math.hypot(dc, da)
      const room = (circ.c - act.c) * face.c + (circ.a - act.a) * face.a
      const shape = (deg: number, drop: number): Shape => {
        const an = lean(face, circ.c - act.c, circ.a - act.a, deg)
        const limit = (dir: CPt) => (room > 0 ? Math.min(dist * 0.42, (room * drop) / Math.max(Math.abs(dir.c * face.c + dir.a * face.a), 0.05)) : dist * 0.42)
        const c1 = out(act, an, Math.max(limit(an), 10))
        const c2 = out(circ, cn, Math.max(limit(cn), 12))
        return fromCircle ? [p0, c2, c1, p3] : [p0, c1, c2, p3]
      }
      // se a ligação passaria por trás de outro card, desce reta por mais tempo antes de virar
      return firstClear([shape(30, 0.5), shape(0, 0.8), shape(0, 1)], w, boxes)
    }
    case 'row': return [p0, out(p0, n0, Math.abs(dc) * 0.4), out(p3, n3, Math.abs(dc) * 0.4), p3]
    default: {
      const shape = (k0: number, k3: number): Shape => [p0, out(p0, n0, Math.abs(da) * k0), out(p3, n3, Math.abs(da) * k3), p3]
      // o S simétrico é o padrão; se ele cruza um card, vira mais cedo ou mais tarde
      return w.route.kind === 'sweep' ? firstClear([shape(0.46, 0.46), shape(0.2, 0.8), shape(0.8, 0.2)], w, boxes) : shape(0.46, 0.46)
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
export const freqOpacity = (f: number) => 0.5 + f * 0.5

// raiz quadrada: num log real, caminhos de dezenas de casos não somem ao lado de um de milhares
export const freqHalfW = (f: number) => 1.5 + Math.sqrt(f) * 9.0

/*
 * Frequência da atividade no card (0..1): a faixa do topo clareia e o brilho azul que desce dela
 * ganha força. O card em si continua escuro, como o resto da interface.
 */
export const CARD_BASE = '#2b3849'
export const CARD_ACCENT = '#4d8fc0'
const STRIPE_LOW = [84, 100, 120]
const STRIPE_HIGH = [126, 194, 248]
const mix = (lo: number[], hi: number[], f: number) => `rgb(${lo.map((v, i) => Math.round(v + (hi[i] - v) * clamp(f, 0, 1))).join(',')})`
export const activityStripe = (f: number) => mix(STRIPE_LOW, STRIPE_HIGH, f)
export const activityGlow = (f: number) => clamp(f, 0, 1)

export function curvePath(c: Curve): string {
  return `M ${c.p0.x},${c.p0.y} C ${c.p1.x},${c.p1.y} ${c.p2.x},${c.p2.y} ${c.p3.x},${c.p3.y}`
}

/** Seta afunilada: quase um ponto na origem, corpo cheio no pescoço e ponta reta com ângulo de ~30°. */
export function arrowPath(c: Curve, baseHW: number, N = 32): string {
  const START_HW = 0.4
  // a ponta tem um tamanho mínimo: num caminho raro ela continua legível
  const headHW = Math.max(baseHW * 1.8, 6.5)
  const tE = cubicTang(c.p0, c.p1, c.p2, c.p3, 1)
  const nE = perp(tE)
  const span = Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y)
  const back = Math.min(headHW * 1.7, span * 0.6)
  // o corpo termina no pescoço, já na direção de chegada: a ponta é a continuação reta dele
  const shift = (p: Pt) => ({ x: p.x - tE.x * back, y: p.y - tE.y * back })
  const neck = shift(c.p3)
  const q2 = shift(c.p2)
  const S = N * 2
  const pts = Array.from({ length: S + 1 }, (_, i) => cubicAt(c.p0, c.p1, q2, neck, i / S))
  const cum = [0]
  for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const right: Pt[] = []
  const left: Pt[] = []
  for (let i = 0; i <= N; i++) {
    const p = pts[i * 2]
    const n = i === N ? nE : perp(cubicTang(c.p0, c.p1, q2, neck, i / N))
    // a espessura cresce com a distância percorrida, não com o parâmetro: a curva afina por igual
    const hw = START_HW + (baseHW - START_HW) * (cum[S] > 0 ? cum[i * 2] / cum[S] : 1)
    right.push({ x: p.x + n.x * hw, y: p.y + n.y * hw })
    left.push({ x: p.x - n.x * hw, y: p.y - n.y * hw })
  }
  const aR = { x: neck.x + nE.x * headHW, y: neck.y + nE.y * headHW }
  const aL = { x: neck.x - nE.x * headHW, y: neck.y - nE.y * headHW }
  const f = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  return [`M ${f(right[0])}`, ...right.slice(1).map((p) => `L ${f(p)}`), `L ${f(aR)}`, `L ${f(c.p3)}`, `L ${f(aL)}`, ...left.slice().reverse().map((p) => `L ${f(p)}`), 'Z'].join(' ')
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
