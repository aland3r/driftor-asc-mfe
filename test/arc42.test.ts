import { describe, expect, it } from 'vitest'
import { parseArc42 } from '../src/features/docs/arc42'

describe('arc42', () => {
  it('divide seções e subseções sem confundir blocos de código', () => {
    const md = ['# Título', 'Grupo: A e B', '## 1. Introdução', '### 1.1 Visão', 'texto', '```mermaid', '## 9. não é seção', '```', '## 2. Restrições', '### 2.1 Técnicas'].join('\n')
    const { intro, sections } = parseArc42(md)
    expect(intro).toBe('Grupo: A e B')
    expect(sections.map((s) => s.num)).toEqual(['01', '02'])
    expect(sections[0].sub).toEqual([{ id: '1.1', title: 'Visão' }])
    expect(sections[0].body).toContain('## 9. não é seção')
  })
})
