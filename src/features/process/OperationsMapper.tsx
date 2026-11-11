import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Pencil, Plus } from 'lucide-react'
import type { Activity, Operation } from '../../api/types'
import './mapping.css'

/*
  Mapeamento evento → atividade, portado do modal de log do Deviante:
  - evento: só o rótulo bruto do log, sem contagens: os números aparecem no grafo, depois do mapeamento;
  - atividade: clicar no quadro edita o nome (o lápis só aparece no hover, como dica), validada no check;
  - a descrição do catálogo acompanha a atividade ao salvar, mas não aparece aqui: a tela mostra só o necessário;
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

  // a descrição é a da atividade escolhida no catálogo; uma atividade nova começa sem descrição
  const describe = (name: string) => catalog.find((a) => key(a.name) === key(name))?.description ?? ''

  function edit(i: number) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, state: 'editing' } : r.state === 'editing' ? settle(r) : r)))
  }

  /** Sai da edição ao perder o foco. Se a linha já foi validada nesse meio tempo, fica como está. */
  function close(i: number) {
    setRows((rs) => rs.map((r, j) => (j === i && r.state === 'editing' ? settle(r) : r)))
  }

  function validate(i: number) {
    setRows((rs) => rs.map((r, j) => {
      if (j !== i) return r
      if (r.state === 'validated') return { ...r, state: 'suggested' }
      return { ...r, state: r.activity.trim() ? 'validated' : 'pending' }
    }))
  }

  function pick(i: number, name: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? settle({ ...r, activity: name, description: describe(name) }) : r)))
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
              onName={(activity) => update(i, { activity, description: describe(activity) })}
              onPick={(name) => pick(i, name)}
              onEdit={() => edit(i)}
              onClose={() => close(i)}
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
  return <p className="mapper-event mono" title={op.rawLabel}>{op.rawLabel}</p>
}

function ActivityCard({ row, catalog, onName, onPick, onEdit, onClose, onValidate }: {
  row: MappingRow
  catalog: CatalogEntry[]
  onName: (name: string) => void
  onPick: (name: string) => void
  onEdit: () => void
  onClose: () => void
  onValidate: () => void
}) {
  const editing = row.state === 'editing'
  const validated = row.state === 'validated'
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTyped(false); if (editing) { ref.current?.focus(); ref.current?.select(); setOpen(true) } else setOpen(false) }, [editing])

  // Ao abrir a edição, o catálogo inteiro aparece; depois de digitar, a lista filtra pelo texto.
  const q = key(row.activity)
  const filtered = useMemo(
    () => catalog
      .filter((a) => key(a.name) !== q && (!typed || key(a.name).includes(q)))
      .sort((a, b) => Number(b.inProcess) - Number(a.inProcess) || a.name.localeCompare(b.name, 'pt-BR')),
    [catalog, q, typed],
  )
  const canCreate = typed && q.length > 0 && !catalog.some((a) => key(a.name) === q)

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
                onChange={(e) => { onName(e.target.value); setTyped(true); setOpen(true) }}
                onBlur={() => { setOpen(false); onClose() }}
                onKeyDown={(e) => { if (e.key === 'Enter') onValidate() }}
              />
              {open && (filtered.length > 0 || canCreate) && (
                <div className="activity-options" role="listbox">
                  {filtered.map((a) => (
                    <button type="button" key={a.id} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); onPick(a.name) }}>
                      <span className="option-name">{a.name}</span>
                      <span className={`option-tag ${a.inProcess ? 'in-process' : ''}`}>{a.inProcess ? 'neste processo' : 'catálogo'}</span>
                    </button>
                  ))}
                  {canCreate && (
                    <button type="button" className="create" onMouseDown={(e) => { e.preventDefault(); onPick(row.activity.trim()) }}>
                      <Plus size={12} />Criar atividade “{row.activity.trim()}”
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="activity-pick" onClick={onEdit} aria-label={`Editar atividade${row.activity ? ` ${row.activity}` : ''}`}>
              <span className={`activity-name ${validated ? 'is-valid' : ''}`}>{row.activity || <span className="placeholder">Nome da atividade…</span>}</span>
              <Pencil size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <button type="button" className={`circle ${validated ? 'ok' : ''}`} onClick={onValidate} aria-label="Validar atividade" aria-pressed={validated} title="Validar atividade"><Check size={12} /></button>
    </div>
  )
}

function MappingStatus({ state }: { state: RowState }) {
  const label = { validated: '✓ OK', pending: 'Pendente', editing: 'Editando', suggested: 'Sugerida' }[state]
  return <span className={`badge mapper-status ${state === 'validated' ? 'badge-ok' : state === 'pending' ? 'badge-warn' : ''}`}>{label}</span>
}
