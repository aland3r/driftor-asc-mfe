import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Check, Loader2, Upload } from 'lucide-react'
import { api } from '../../api/client'
import type { Activity, Process } from '../../api/types'
import { Modal } from '../../components/Modal'
import { number } from '../../lib/format'
import { OperationsMapper, initialRows, mappingProgress, type MappingRow } from './OperationsMapper'

const ACCEPTED = ['xes', 'csv']

/** Novo processo = Create do CRUD de processos: envio do log e mapeamento no mesmo modal. */
export function UploadLogModal({ onClose, onDone, resume }: { onClose: () => void; onDone: (p: Process) => void; resume?: Process }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [process, setProcess] = useState<Process | null>(resume ?? null)
  const [rows, setRowsState] = useState<MappingRow[]>(resume ? initialRows(resume.operations) : [])
  const [catalog, setCatalog] = useState<Activity[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { api.activities().then(setCatalog).catch(() => setCatalog([])) }, [])
  const setRows = (fn: (r: MappingRow[]) => MappingRow[]) => setRowsState(fn)

  function choose(f: File | undefined | null) {
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED.includes(ext)) { setError('Envie um arquivo .xes ou .csv.'); setFile(null); return }
    setError(null)
    setFile(f)
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
  }

  async function send() {
    if (!file || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const p = await api.uploadProcess(name.trim(), file)
      setProcess(p)
      setRowsState(initialRows(p.operations))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!process) return
    setBusy(true)
    setError(null)
    try {
      const p = await api.mapOperations(process.id, rows.map((r) => ({ rawLabel: r.rawLabel, activity: r.activity.trim() })))
      onDone(p)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const progress = mappingProgress(rows)

  return (
    <Modal
      wide
      title={resume ? 'Concluir mapeamento' : 'Novo processo'}
      description={process ? 'Associe cada evento do log a uma atividade do processo. Concluir gera o grafo e as variantes.' : 'Envie um log de eventos .xes ou .csv. Depois do envio, associe cada evento a uma atividade do processo.'}
      onClose={onClose}
      footer={process ? (
        <>
          <span className={`footer-status ${progress.complete ? 'complete' : progress.done ? 'partial' : ''}`}>
            {progress.complete ? 'Tudo validado. Concluir gera o grafo do processo.' : `${progress.done} de ${progress.total} eventos validados`}
          </span>
          {error && <span className="error-text">{error}</span>}
          <button type="button" className="btn" onClick={onClose}>Continuar depois</button>
          <button type="button" className="btn btn-primary" disabled={!progress.complete || busy} onClick={finish}>
            {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}Concluir mapeamento
          </button>
        </>
      ) : undefined}
    >
      {process ? (
        <div className="stack">
          <div className="file-ok">
            <span className="file-ok-icon"><Check size={14} /></span>
            <div>
              <p className="name">{process.fileName}</p>
              <p className="meta">{process.operations.length} eventos distintos · {number(process.traceCount)} traces · {number(process.eventCount)} eventos · {process.format.toUpperCase()}</p>
            </div>
          </div>
          <OperationsMapper rows={rows} setRows={setRows} catalog={catalog} />
        </div>
      ) : (
        <div className="stack">
          <label>
            <span className="field-label">Nome do processo</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Torno 02, linha de usinagem" maxLength={80} />
          </label>
          <div
            className={`dropzone ${over ? 'over' : ''} ${error ? 'error' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]) }}
          >
            <span className="dropzone-icon"><Upload size={18} /></span>
            <div>
              <p style={{ fontWeight: 500 }}>{busy ? 'Lendo o log…' : file ? file.name : 'Arraste o arquivo do log aqui'}</p>
              <p className="hint">{file ? `${(file.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : 'Formatos aceitos: .xes e .csv'}</p>
              {error && <p className="error-text" style={{ marginTop: 6 }}>{error}</p>}
            </div>
            <input ref={input} type="file" accept=".xes,.csv" hidden onChange={(e) => choose(e.target.files?.[0])} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>Selecionar arquivo</button>
              <button type="button" className="btn btn-primary" onClick={send} disabled={!file || !name.trim() || busy}>
                {busy ? <><Loader2 size={14} className="spin" />Enviando…</> : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** "Operações" no detalhe do processo: refaz o mapeamento e regenera o grafo. */
export function RemapModal({ process, onClose, onDone }: { process: Process; onClose: () => void; onDone: (p: Process) => void }) {
  const [rows, setRowsState] = useState<MappingRow[]>(initialRows(process.operations, true))
  const [catalog, setCatalog] = useState<Activity[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.activities().then(setCatalog).catch(() => setCatalog([])) }, [])
  const progress = mappingProgress(rows)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      onDone(await api.mapOperations(process.id, rows.map((r) => ({ rawLabel: r.rawLabel, activity: r.activity.trim() }))))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      wide
      title="Operações"
      description={`${process.operations.length} eventos de ${process.fileName}. Mudar uma atividade regenera o grafo e as variantes.`}
      onClose={onClose}
      footer={
        <>
          <span className={`footer-status ${progress.complete ? 'complete' : 'partial'}`}>{progress.done} de {progress.total} eventos validados</span>
          {error && <span className="error-text">{error}</span>}
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!progress.complete || busy} onClick={save}>
            {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}Salvar mapeamento
          </button>
        </>
      }
    >
      <OperationsMapper rows={rows} setRows={(fn) => setRowsState(fn)} catalog={catalog} />
    </Modal>
  )
}
