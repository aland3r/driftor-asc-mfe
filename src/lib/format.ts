/** Formatos únicos do app: os mesmos em Processo e Análise. */

export function caseLabel(index: number): string {
  return `CASE-${String(index).padStart(4, '0')}`
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const r = s % 60
    return r ? `${m} min ${r} s` : `${m} min`
  }
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

export function number(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('pt-BR')
}

export function percent(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`
}

export function delta(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

export function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return d === 1 ? 'ontem' : `há ${d} dias`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function treatmentLabel(t: 'raw' | 'treated'): string {
  return t === 'raw' ? 'Bruto' : 'Tratado'
}
