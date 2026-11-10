import { useEffect, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { caseLabel, duration, number } from '../lib/format'
import './trace-list.css'

export type TraceStatus = 'neutral' | 'normal' | 'outlier' | 'drift'

export interface TraceItem {
  index: number
  seconds: number | null
  status: TraceStatus
}

export interface TraceGroup {
  id: string
  label: string
  count: number
  driftCount?: number
  outlierCount?: number
  detail?: string
  traces: TraceItem[]
}

const PAGE = 40

/**
 * Lista de traces única: a mesma em Processo (grupos = variantes) e em
 * Análise (grupos = segmentos entre desvios). Mesmo id CASE-0001, mesma
 * duração, mesmas cores de status.
 */
export function TraceList({ groups, groupNoun, selectedGroup, onSelectGroup, selectedTrace, onSelectTrace, onClose }: {
  groups: TraceGroup[]
  groupNoun: { one: string; many: string }
  selectedGroup?: string | null
  onSelectGroup?: (id: string) => void
  selectedTrace?: number | null
  onSelectTrace?: (index: number) => void
  onClose?: () => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [shown, setShown] = useState<Record<string, number>>({})
  const total = groups.reduce((sum, g) => sum + g.count, 0)

  useEffect(() => {
    if (groups[0]) setOpen((o) => (Object.keys(o).length ? o : { [groups[0].id]: true }))
  }, [groups])
  useEffect(() => {
    if (selectedGroup) setOpen((o) => ({ ...o, [selectedGroup]: true }))
  }, [selectedGroup])

  return (
    <aside className="trace-list" aria-label="Traces">
      <div className="trace-list-head">
        <span className="label">{number(total)} traces · {groups.length} {groups.length === 1 ? groupNoun.one : groupNoun.many}</span>
        {onClose && <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar lista"><X size={14} /></button>}
      </div>
      <div className="trace-list-body">
        {groups.map((g) => {
          const isOpen = !!open[g.id]
          const limit = shown[g.id] ?? PAGE
          return (
            <div key={g.id} className="trace-group">
              <button
                type="button"
                className={`trace-group-head ${selectedGroup === g.id ? 'selected' : ''}`}
                aria-expanded={isOpen}
                onClick={() => { setOpen((o) => ({ ...o, [g.id]: !o[g.id] })); onSelectGroup?.(g.id) }}
              >
                <ChevronRight size={14} className="chev" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
                <span className="trace-group-label">{g.label}</span>
                <span className="trace-group-count">{number(g.count)}</span>
                {(g.driftCount || g.outlierCount || g.detail) ? (
                  <span className="trace-group-meta">
                    {g.detail && <span>{g.detail}</span>}
                    {g.driftCount ? <span className="meta-drift">{g.driftCount} desvio</span> : null}
                    {g.outlierCount ? <span className="meta-outlier">{g.outlierCount} outlier{g.outlierCount > 1 ? 's' : ''}</span> : null}
                  </span>
                ) : null}
              </button>
              {isOpen && (
                <ul className="trace-items">
                  {g.traces.slice(0, limit).map((t) => (
                    <li key={t.index}>
                      <button
                        type="button"
                        className={`trace-item ${selectedTrace === t.index ? 'selected' : ''}`}
                        onClick={() => onSelectTrace?.(t.index)}
                      >
                        <span className={`dot dot-${t.status}`} aria-hidden="true" />
                        <span className="trace-id">{caseLabel(t.index)}</span>
                        <span className="trace-dur">{duration(t.seconds)}</span>
                      </button>
                    </li>
                  ))}
                  {g.traces.length > limit && (
                    <li>
                      <button type="button" className="trace-more" onClick={() => setShown((s) => ({ ...s, [g.id]: limit + PAGE * 3 }))}>
                        Mostrar mais {number(Math.min(PAGE * 3, g.traces.length - limit))} de {number(g.traces.length - limit)}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      <div className="trace-legend">
        <span><i className="dot dot-normal" />normal</span>
        <span><i className="dot dot-outlier" />outlier</span>
        <span><i className="dot dot-drift" />desvio</span>
      </div>
    </aside>
  )
}
