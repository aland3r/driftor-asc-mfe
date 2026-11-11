import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from '../src/api/types'
import { CIRC_R, END_ID, NODE_W, START_ID, filterByDensity, layoutGraph } from '../src/features/graph/geometry'

const node = (id: string, frequency: number, start = 0, end = 0): GraphNode => ({
  id, label: id, frequency, caseFrequency: frequency, startFrequency: start, endFrequency: end, maxRepetitions: 1,
  totalDurationSeconds: 0, meanDurationSeconds: 0, medianDurationSeconds: 0, minDurationSeconds: 0, maxDurationSeconds: 0, histogram: [],
})
const nodes = [node('Carregar', 500, 500), node('Operar', 500), node('Descarregar', 496, 0, 496), node('Falha', 4, 0, 4)]
const edges: GraphEdge[] = [
  { source: 'Carregar', target: 'Operar', frequency: 500 },
  { source: 'Operar', target: 'Descarregar', frequency: 496 },
  { source: 'Operar', target: 'Falha', frequency: 4 },
]

describe('grafo do processo', () => {
  it('liga início e fim pelas frequências de início e fim', () => {
    const { edges: all } = filterByDensity(nodes, edges, 100, 100)
    expect(all).toContainEqual({ source: START_ID, target: 'Carregar', frequency: 500 })
    expect(all).toContainEqual({ source: 'Falha', target: END_ID, frequency: 4 })
  })
  it('o controle de atividades esconde as raras primeiro', () => {
    const { nodes: kept } = filterByDensity(nodes, edges, 75, 100)
    expect(kept.map((n) => n.id)).not.toContain('Falha')
  })
  it('caminho raro some com pouca densidade, mas nenhum nó fica solto', () => {
    const { edges: kept } = filterByDensity(nodes, edges, 100, 10)
    expect(kept.some((e) => e.source === 'Operar' && e.target === 'Falha')).toBe(true) // única entrada de Falha
    expect(kept.some((e) => e.source === 'Carregar' && e.target === 'Operar')).toBe(true)
  })
  it('o layout vertical põe o início acima do fim', () => {
    const f = filterByDensity(nodes, edges, 100, 100)
    const laid = layoutGraph(f.nodes, f.edges, 'vertical')
    const start = laid.nodes.find((n) => n.id === START_ID)!
    const end = laid.nodes.find((n) => n.id === END_ID)!
    expect(start.y).toBeLessThan(end.y)
    expect(laid.edges.every((e) => !e.isBack)).toBe(true)
  })
  it('a variante principal fica numa coluna reta e a atividade rara vai para o lado', () => {
    const f = filterByDensity(nodes, edges, 100, 100)
    const laid = layoutGraph(f.nodes, f.edges, 'vertical')
    const center = (id: string) => {
      const n = laid.nodes.find((x) => x.id === id)!
      return n.x + (n.kind === 'activity' ? NODE_W : CIRC_R * 2) / 2
    }
    const spine = [START_ID, 'Carregar', 'Operar', 'Descarregar', END_ID].map(center)
    expect(new Set(spine.map((x) => Math.round(x))).size).toBe(1)
    expect(Math.abs(center('Falha') - spine[0])).toBeGreaterThan(NODE_W)
    const main = laid.edges.find((e) => e.source === 'Operar' && e.target === 'Descarregar')!
    expect(main.curve.p0.x).toBeCloseTo(main.curve.p3.x)
  })
  it('as ligações que chegam ao fim não se encontram no mesmo ponto', () => {
    const f = filterByDensity(nodes, edges, 100, 100)
    const laid = layoutGraph(f.nodes, f.edges, 'vertical')
    const arrivals = laid.edges.filter((e) => e.target === END_ID).map((e) => `${Math.round(e.curve.p3.x)},${Math.round(e.curve.p3.y)}`)
    expect(arrivals).toHaveLength(2)
    expect(new Set(arrivals).size).toBe(2)
    expect(laid.edges.filter((e) => e.isEndpoint)).toHaveLength(3)
  })
  it('um desvio que volta para a espinha fica ao lado, a meia altura, e usa a lateral dos cards', () => {
    const loop = [node('A', 100, 100), node('B', 100, 0, 100), node('Ajuste', 20)]
    const laid = layoutGraph(loop, [
      { source: START_ID, target: 'A', frequency: 100 }, { source: 'A', target: 'B', frequency: 80 }, { source: 'B', target: END_ID, frequency: 100 },
      { source: 'A', target: 'Ajuste', frequency: 20 }, { source: 'Ajuste', target: 'B', frequency: 20 },
    ], 'vertical')
    const at = (id: string) => laid.nodes.find((n) => n.id === id)!
    expect(at('Ajuste').y).toBeGreaterThan(at('A').y)
    expect(at('Ajuste').y).toBeLessThan(at('B').y)
    const leave = laid.edges.find((e) => e.source === 'A' && e.target === 'Ajuste')!
    expect(leave.curve.p0.x).toBeCloseTo(at('A').x + NODE_W) // sai pela lateral direita de A
  })
})
