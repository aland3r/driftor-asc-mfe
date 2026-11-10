import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Pencil, Plus } from 'lucide-react'
import type { Activity, Operation } from '../../api/types'
import { duration, number } from '../../lib/format'
import './mapping.css'

export type RowState = 'suggested' | 'editing' | 'validated' | 'pending'
export interface MappingRow { rawLabel: string; activity: string; state: RowState; op: Operation }

export function initialRows(operations: Operation[], validated = false): MappingRow[] {
  return operations.map((op) => {
    const activity = op.activity ?? op.suggestedActivity ?? ''
    return { rawLabel: op.rawLabel, activity, op, state: validated && activity ? 'validated' : activity ? 'suggested' : 'pending' }
  })
}

/** Mapeamento de operações do log para atividades: o mesmo no upload e em "Operações". */
export function OperationsMapper({ rows, setRows, catalog }: { rows: MappingRow[]; setRows: (fn: (rows: MappingRow[]) => MappingRow[]) => void; catalog: Activity[] }) {
  const names = useMemo(() => {
    const set = new Set(catalog.map((a) => a.name))
    rows.forEach((r) => r.activity && set.add(r.activity))
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [catalog, rows])

  const update = (i: number, patch: Partial<MappingRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const settle = (r: MappingRow): MappingRow => ({ ...r, state: r.activity.trim() ? 'suggested' : 'pending' })

  return (
    <div className="mapper">
      <div className="mapper-head">
        <div>
          <h3>Mapear eventos para atividades</h3>
          <p>Associe cada evento encontrado no log a uma atividade do processo. Eventos com a mesma atividade viram um único nó do grafo.</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setRows((rs) => rs.map((r) => (r.activity.trim() ? { ...r, state: 'validated' } : { ...r, state: 'pending' })))}>
          <Check size={14} />Validar sugestões
        </button>
      </div>
      <div className="mapper-cols" aria-hidden="true">
        <span>Evento do log</span><span /><span>Atividade</span><span />
      </div>
      <ul className="mapper-rows">
        {rows.map((row, i) => (
          <li key={row.rawLabel} className="mapper-row">
            <div className="mapper-event">
              <p className="mono">{row.rawLabel}</p>
              <p className="mapper-meta">média {duration(row.op.meanDurationSeconds)} · {number(row.op.occurrenceCount)} ocorrências · {number(row.op.caseCount)} traces</p>
            </div>
            <ArrowRight size={14} className="mapper-arrow" aria-hidden="true" />
            <ActivityCard
              row={row}
              options={names}
              onChange={(activity) => update(i, { activity })}
              onEdit={() => setRows((rs) => rs.map((r, j) => (j === i ? (r.state === 'editing' ? settle(r) : { ...r, state: 'editing' }) : r.state === 'editing' ? settle(r) : r)))}
              onValidate={() => update(i, row.state === 'validated' ? { state: 'suggested' } : row.activity.trim() ? { state: 'validated' } : { state: 'pending' })}
            />
            <span className={`badge ${row.state === 'validated' ? 'badge-ok' : row.state === 'pending' ? 'badge-warn' : ''}`}>
              {row.state === 'validated' ? 'validado' : row.state === 'pending' ? 'pendente' : row.state === 'editing' ? 'editando' : 'sugerido'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function mappingProgress(rows: MappingRow[]) {
  const done = rows.filter((r) => r.state === 'validated').length
  return { done, total: rows.length, complete: rows.length > 0 && done === rows.length }
}

function ActivityCard({ row, options, onChange, onEdit, onValidate }: {
  row: MappingRow
  options: string[]
  onChange: (name: string) => void
  onEdit: () => void
  onValidate: () => void
}) {
  const editing = row.state === 'editing'
  const validated = row.state === 'validated'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) { ref.current?.focus(); setOpen(true) } else setOpen(false) }, [editing])
  const q = row.activity.trim().toLowerCase()
  const filtered = options.filter((a) => a.toLowerCase().includes(q) && a !== row.activity).slice(0, 7)
  const canCreate = q.length > 0 && !options.some((a) => a.toLowerCase() === q)

  return (
    <div className="activity-card-wrap">
      <div className={`activity-card state-${row.state}`}>
        <div className="activity-card-bar" />
        <div className="activity-card-body">
          {editing ? (
            <>
              <input
                ref={ref}
                value={row.activity}
                aria-label={`Atividade para ${row.rawLabel}`}
                placeholder="Nome da atividade"
                onChange={(e) => { onChange(e.target.value); setOpen(true) }}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => { if (e.key === 'Enter') onValidate() }}
              />
              {open && (filtered.length > 0 || canCreate) && (
                <div className="activity-options" role="listbox">
                  {filtered.map((a) => (
                    <button type="button" key={a} role="option" aria-selected={false} onMouseDown={() => { onChange(a); setOpen(false) }}>{a}</button>
                  ))}
                  {canCreate && (
                    <button type="button" className="create" onMouseDown={() => setOpen(false)}><Plus size={12} />Criar “{row.activity.trim()}”</button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className={validated ? 'is-valid' : ''}>{row.activity || <span className="placeholder">Nome da atividade</span>}</p>
          )}
        </div>
      </div>
      <div className="activity-card-actions">
        <button type="button" className={`circle ${editing ? 'active' : ''}`} onClick={onEdit} aria-label="Editar atividade" title="Editar"><Pencil size={12} /></button>
        <button type="button" className={`circle ${validated ? 'ok' : ''}`} onClick={onValidate} aria-label="Validar atividade" title="Validar"><Check size={12} /></button>
      </div>
    </div>
  )
}
