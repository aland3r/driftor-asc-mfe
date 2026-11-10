import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TraceList } from '../src/components/TraceList'

describe('TraceList', () => {
  it('é a mesma lista para variantes e segmentos', () => {
    render(
      <TraceList
        groupNoun={{ one: 'segmento', many: 'segmentos' }}
        groups={[{ id: 's1', label: 'Segmento 1', count: 2, driftCount: 1, traces: [{ index: 1, seconds: 58, status: 'normal' }, { index: 2, seconds: 83, status: 'drift' }] }]}
      />,
    )
    expect(screen.getByText('2 traces · 1 segmento')).toBeTruthy()
    expect(screen.getByText('CASE-0002')).toBeTruthy()
    expect(screen.getByText('1 min 23 s')).toBeTruthy()
  })
})
