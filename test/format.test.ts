import { describe, expect, it } from 'vitest'
import { caseLabel, delta, duration, percent } from '../src/lib/format'

describe('formatos únicos do app', () => {
  it('identifica traces como CASE-0001', () => {
    expect(caseLabel(1)).toBe('CASE-0001')
    expect(caseLabel(12345)).toBe('CASE-12345')
  })
  it('escreve durações como "58 s" e "1 min 23 s"', () => {
    expect(duration(58.4)).toBe('58 s')
    expect(duration(83)).toBe('1 min 23 s')
    expect(duration(120)).toBe('2 min')
    expect(duration(4920)).toBe('1 h 22 min')
    expect(duration(null)).toBe('—')
  })
  it('formata variação e δ em pt-BR', () => {
    expect(percent(25.06)).toBe('+25,1 %')
    expect(delta(0.002)).toBe('0,002')
  })
})
