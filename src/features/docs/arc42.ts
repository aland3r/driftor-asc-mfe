/** Divide o arc42.md nas seções "## N. Título" e subseções "### N.M". */
export interface Arc42Section { id: string; num: string; title: string; body: string; sub: { id: string; title: string }[] }

export function parseArc42(markdown: string): { intro: string; sections: Arc42Section[] } {
  const intro: string[] = []
  const sections: (Arc42Section & { lines: string[] })[] = []
  let current: (Arc42Section & { lines: string[] }) | null = null
  let inFence = false
  for (const line of (markdown ?? '').split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence
    const h2 = !inFence ? /^##\s+(\d+)\.\s+(.*)$/.exec(line) : null
    if (h2) {
      current = { id: h2[1], num: h2[1].padStart(2, '0'), title: h2[2].trim(), body: '', sub: [], lines: [] }
      sections.push(current)
      continue
    }
    const h3 = !inFence && current ? /^###\s+(\d+\.\d+)\s+(.*)$/.exec(line) : null
    if (h3 && current) current.sub.push({ id: h3[1], title: h3[2].replace(/[`*]/g, '').trim() })
    if (current) current.lines.push(line)
    else if (!/^#\s/.test(line)) intro.push(line)
  }
  return {
    intro: intro.join('\n').replace(/^\s*---\s*$/gm, '').trim(),
    sections: sections.map(({ lines, ...s }) => ({ ...s, body: lines.join('\n').trim() })),
  }
}

export const SECTION_BLURBS: Record<string, string> = {
  1: 'Requisitos, metas de qualidade e stakeholders',
  2: 'Restrições técnicas, organizacionais e convenções',
  3: 'Contexto de negócio e técnico, interfaces externas',
  4: 'Decisões fundamentais e estratégias de solução',
  5: 'Decomposição estática do sistema em blocos',
  6: 'Comportamento dos blocos em cenários de execução',
  7: 'Infraestrutura técnica e mapeamento dos blocos',
  8: 'Regras e soluções que valem para vários blocos',
  9: 'Decisões importantes, caras ou arriscadas',
  10: 'Cenários de qualidade verificáveis',
  11: 'Riscos e dívidas técnicas conhecidos',
  12: 'Termos de domínio e técnicos',
}
