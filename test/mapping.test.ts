import { describe, expect, it } from 'vitest'
import { catalogFor, initialRows, mappingProgress } from '../src/features/process/OperationsMapper'
import type { Operation } from '../src/api/types'

const op = (rawLabel: string, suggestedActivity: string, activity: string | null = null): Operation => ({
  rawLabel, suggestedActivity, activity, occurrenceCount: 1, caseCount: 1, meanDurationSeconds: 1,
})

describe('mapeamento de operações', () => {
  it('sugere a atividade, puxa a descrição do catálogo e começa sem validar', () => {
    const rows = initialRows([op('Usinagem', 'usinagem'), op('X', '')], [{ id: 'a', name: 'Usinagem', description: 'Corte' }])
    expect(rows.map((r) => [r.activity, r.description, r.state])).toEqual([['usinagem', 'Corte', 'suggested'], ['', '', 'pending']])
    expect(mappingProgress(rows)).toEqual({ done: 0, total: 2, complete: false })
  })

  it('em Operações as linhas já mapeadas chegam validadas', () => {
    const rows = initialRows([op('A', 'A', 'Alimentação')], [], true)
    expect(rows[0].state).toBe('validated')
    expect(mappingProgress(rows).complete).toBe(true)
  })

  it('marca no catálogo as atividades que já estão neste processo', () => {
    const list = catalogFor([op('A', 'A', 'Alimentação')], [{ id: '1', name: 'Retirada' }, { id: '2', name: 'alimentação' }])
    expect(list.map((a) => [a.name, a.inProcess])).toEqual([['alimentação', true], ['Retirada', false]])
  })
})
