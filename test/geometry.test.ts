import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from '../src/api/types'
import { END_ID, START_ID, filterByDensity, layoutGraph } from '../src/features/graph/geometry'

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
})
