import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Pencil, Plus } from 'lucide-react'
import type { Activity, Operation } from '../../api/types'
import { duration, number } from '../../lib/format'
import './mapping.css'

/*
  Mapeamento evento → atividade, portado do modal de log do Deviante:
  - evento: rótulo bruto do log, só leitura;
  - atividade: nome editável (lápis) com descrição opcional, validada no check;
  - concluir só com todas as linhas validadas.
*/

export type RowState = 'suggested' | 'editing' | 'validated' | 'pending'
export interface MappingRow { rawLabel: string; activity: string; description: string; state: RowState; op: Operation }
export interface CatalogEntry extends Activity { inProcess: boolean }

const key = (name: string) => name.trim().toLocaleLowerCase('pt-BR')

export function initialRows(operations: Operation[], catalog: Activity[], validated = false): MappingRow[] {
  const byName = new Map(catalog.map((a) => [key(a.name), a.description ?? '']))
  return operations.map((op) => {
    const activity = op.activity ?? op.suggestedActivity ?? ''
    return {
      rawLabel: op.rawLabel,
      activity,
      description: byName.get(key(activity)) ?? '',
      op,
      state: !activity.trim() ? 'pending' : validated ? 'validated' : 'suggested',
    }
  })
}

/** Catálogo com as atividades deste processo primeiro, marcadas como "neste processo". */
export function catalogFor(operations: Operation[], catalog: Activity[]): CatalogEntry[] {
  const inProcess = new Set(operations.map((op) => op.activity).filter(Boolean).map((n) => key(n!)))
  return [
    ...catalog.filter((a) => inProcess.has(key(a.name))).map((a) => ({ ...a, inProcess: true })),
    ...catalog.filter((a) => !inProcess.has(key(a.name))).map((a) => ({ ...a, inProcess: false })),
  ]
}

export function mappingProgress(rows: MappingRow[]) {
  const done = rows.filter((r) => r.state === 'validated').length
  return { done, total: rows.length, complete: rows.length > 0 && done === rows.length }
}

export function OperationsMapper({ rows, setRows, catalog }: {
  rows: MappingRow[]
  setRows: (fn: (rows: MappingRow[]) => MappingRow[]) => void
  catalog: CatalogEntry[]
}) {
  const settle = (r: MappingRow): MappingRow => ({ ...r, state: r.activity.trim() ? 'suggested' : 'pending' })
  const update = (i: number, patch: Partial<MappingRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  function edit(i: number) {
    setRows((rs) => rs.map((r, j) => {
      if (j === i) return r.state === 'editing' ? settle(r) : { ...r, state: 'editing' }
      return r.state === 'editing' ? settle(r) : r
    }))
  }

  function validate(i: number) {
    setRows((rs) => rs.map((r, j) => {
      if (j !== i) return r
      if (r.state === 'validated') return { ...r, state: 'suggested' }
      return { ...r, state: r.activity.trim() ? 'validated' : 'pending' }
    }))
  }

  function pick(i: number, name: string) {
    const known = catalog.find((a) => key(a.name) === key(name))
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, activity: name, description: r.description || known?.description || '' } : r)))
  }

  return (
    <div className="mapper">
      <div className="mapper-head">
        <h3>Mapear eventos para atividades</h3>
        <p>Associe cada evento encontrado no log a uma atividade do catálogo. Eventos com a mesma atividade viram um único nó do grafo.</p>
      </div>
      <div className="mapper-cols" aria-hidden="true">
        <span>Evento do log</span><span /><span>Atividade</span><span />
      </div>
      <ul className="mapper-rows">
        {rows.map((row, i) => (
          <li key={row.rawLabel} className="mapper-row">
            <EventCell op={row.op} />
            <ArrowRight size={14} className="mapper-arrow" aria-hidden="true" />
            <ActivityCard
              row={row}
              catalog={catalog}
              onName={(activity) => update(i, { activity })}
              onPick={(name) => pick(i, name)}
              onDescription={(description) => update(i, { description })}
              onEdit={() => edit(i)}
              onValidate={() => validate(i)}
            />
            <MappingStatus state={row.state} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function EventCell({ op }: { op: Operation }) {
  const plural = (n: number, one: string, many: string) => `${number(n)} ${n === 1 ? one : many}`
  return (
    <div className="mapper-event">
      <p className="mono" title={op.rawLabel}>{op.rawLabel}</p>
      <p className="mapper-meta">
        {plural(op.occurrenceCount, 'ocorrência', 'ocorrências')}
        {op.caseCount > 0 && ` · ${plural(op.caseCount, 'traço', 'traços')}`}
        {op.meanDurationSeconds > 0 && ` · ${duration(op.meanDurationSeconds)} em média`}
      </p>
    </div>
  )
}

function ActivityCard({ row, catalog, onName, onPick, onDescription, onEdit, onValidate }: {
  row: MappingRow
  catalog: CatalogEntry[]
  onName: (name: string) => void
  onPick: (name: string) => void
  onDescription: (description: string) => void
  onEdit: () => void
  onValidate: () => void
}) {
  const editing = row.state === 'editing'
  const validated = row.state === 'validated'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) { ref.current?.focus(); setOpen(true) } else setOpen(false) }, [editing])

  const q = key(row.activity)
  const filtered = useMemo(() => catalog.filter((a) => key(a.name).includes(q) && key(a.name) !== q).slice(0, 6), [catalog, q])
  const canCreate = q.length > 0 && !catalog.some((a) => key(a.name) === q)

  return (
    <div className="activity-card-wrap">
      <div className={`activity-card state-${row.state}`}>
        <div className="activity-card-bar" />
        <div className="activity-card-body">
          {editing ? (
            <div className="activity-name-edit">
              <input
                ref={ref}
                className="activity-name"
                value={row.activity}
                aria-label={`Atividade para o evento ${row.rawLabel}`}
                placeholder="Nome da atividade…"
                onChange={(e) => { onName(e.target.value); setOpen(true) }}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => { if (e.key === 'Enter') onValidate() }}
              />
              {open && (filtered.length > 0 || canCreate) && (
                <div className="activity-options" role="listbox">
                  {filtered.map((a) => (
                    <button type="button" key={a.id} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); onPick(a.name); setOpen(false) }}>
                      <span className="option-name">{a.name}</span>
                      <span className={`option-tag ${a.inProcess ? 'in-process' : ''}`}>{a.inProcess ? 'neste processo' : 'catálogo'}</span>
                    </button>
                  ))}
                  {canCreate && (
                    <button type="button" className="create" onMouseDown={(e) => { e.preventDefault(); onPick(row.activity.trim()); setOpen(false) }}>
                      <Plus size={12} />Criar atividade “{row.activity.trim()}”
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className={`activity-name ${validated ? 'is-valid' : ''}`}>{row.activity || <span className="placeholder">Nome da atividade…</span>}</p>
          )}
          <input
            className="activity-description"
            value={row.description}
            onChange={(e) => onDescription(e.target.value)}
            disabled={validated}
            placeholder="Descrição opcional"
            maxLength={280}
            aria-label={`Descrição da atividade para ${row.rawLabel}`}
          />
        </div>
      </div>
      <div className="activity-card-actions">
        <button type="button" className={`circle ${editing ? 'active' : ''}`} onClick={onEdit} aria-label="Editar atividade" aria-pressed={editing} title="Editar atividade"><Pencil size={12} /></button>
        <button type="button" className={`circle ${validated ? 'ok' : ''}`} onClick={onValidate} aria-label="Validar atividade" aria-pressed={validated} title="Validar atividade"><Check size={12} /></button>
      </div>
    </div>
  )
}

function MappingStatus({ state }: { state: RowState }) {
  const label = { validated: '✓ OK', pending: 'Pendente', editing: 'Editando', suggested: 'Sugerida' }[state]
  return <span className={`badge mapper-status ${state === 'validated' ? 'badge-ok' : state === 'pending' ? 'badge-warn' : ''}`}>{label}</span>
}
