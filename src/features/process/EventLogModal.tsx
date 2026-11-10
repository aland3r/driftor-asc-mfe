import { useEffect, useRef, useState, type DragEvent, type RefObject } from 'react'
import { Check, Loader2, Upload } from 'lucide-react'
import { api } from '../../api/client'
import type { Activity, Process } from '../../api/types'
import { Modal } from '../../components/Modal'
import { number } from '../../lib/format'
import { OperationsMapper, catalogFor, initialRows, mappingProgress, type MappingRow } from './OperationsMapper'

const ACCEPTED = ['xes', 'csv']

/**
 * Carregar log de eventos + mapear operações, no mesmo modal (fluxo do Deviante):
 * - upload: processo sem log (ou troca de log); o mapeamento cresce abaixo depois do envio;
 * - resume: log já carregado, mapeamento pendente;
 * - remap: "Operações" de um processo pronto; concluir regenera grafo e variantes.
 * Fechar sem concluir devolve o processo como ficou, para a página se atualizar.
 */
export function EventLogModal({ process: initial, mode, onClose, onDone }: {
  process: Process
  mode: 'upload' | 'resume' | 'remap'
  onClose: (latest: Process) => void
  onDone: (p: Process) => void
}) {
  const [process, setProcess] = useState<Process>(initial)
  const [loaded, setLoaded] = useState(mode !== 'upload')
  const [file, setFile] = useState<File | null>(null)
  const [formatError, setFormatError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Activity[]>([])
  const [rows, setRowsState] = useState<MappingRow[]>(() => (mode === 'upload' ? [] : initialRows(initial.operations, [], mode === 'remap')))
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.activities().then((list) => {
      setCatalog(list)
      // descrições já cadastradas aparecem nas linhas que ainda não têm uma
      const byName = new Map(list.map((a) => [a.name.trim().toLocaleLowerCase('pt-BR'), a.description ?? '']))
      setRowsState((rs) => rs.map((r) => (r.description ? r : { ...r, description: byName.get(r.activity.trim().toLocaleLowerCase('pt-BR')) ?? '' })))
    }).catch(() => setCatalog([]))
  }, [])

  const setRows = (fn: (r: MappingRow[]) => MappingRow[]) => { setRowsState(fn); setConfirmError(null) }
  const progress = mappingProgress(rows)
  const busy = uploading || confirming
  const close = () => { if (!busy) onClose(process) }

  function choose(f: File | null | undefined) {
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED.includes(ext)) { setFormatError(true); setFile(null); setUploadError(null); return }
    setFormatError(false)
    setUploadError(null)
    setFile(f)
  }

  async function upload() {
    if (!file || uploading) return
    setUploading(true)
    setUploadError(null)
    try {
      const p = await api.uploadLog(process.id, file)
      setProcess(p)
      setRowsState(initialRows(p.operations, catalog))
      setLoaded(true)
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function confirm() {
    if (confirming || !progress.complete) return
    setConfirming(true)
    setConfirmError(null)
    try {
      onDone(await api.mapOperations(process.id, rows.map((r) => ({ rawLabel: r.rawLabel, activity: r.activity.trim(), description: r.description.trim() }))))
    } catch (e) {
      setConfirmError((e as Error).message)
      setConfirming(false)
    }
  }

  return (
    <Modal
      wide
      title={mode === 'remap' ? 'Operações' : 'Carregar log de eventos'}
      description={mode === 'remap'
        ? `${process.operations.length} eventos de ${process.fileName}. Mudar uma atividade regenera o grafo e as variantes.`
        : 'Envie um arquivo .xes ou .csv. Depois do envio, associe cada evento a uma atividade.'}
      onClose={close}
      footer={loaded ? (
        <>
          <div className={`footer-status ${progress.complete ? 'complete' : progress.done ? 'partial' : ''}`}>
            {progress.complete
              ? 'Todas as atividades validadas. Concluir atualiza o grafo.'
              : `${progress.done} de ${progress.total} ${progress.total === 1 ? 'atividade validada' : 'atividades validadas'}.`}
            {confirmError && <span className="error-text footer-error">{confirmError}</span>}
          </div>
          <button type="button" className="btn" onClick={close} disabled={confirming}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!progress.complete || confirming} onClick={confirm}>
            {confirming ? <><Loader2 size={14} className="spin" />Salvando…</> : <><Check size={14} />Concluir mapeamento</>}
          </button>
        </>
      ) : undefined}
    >
      <div className="stack">
        {loaded ? (
          mode !== 'remap' && (
            <div className="file-ok">
              <span className="file-ok-icon"><Check size={16} /></span>
              <div>
                <p className="name">{process.fileName}</p>
                <p className="meta">
                  {process.operations.length} {process.operations.length === 1 ? 'evento distinto' : 'eventos distintos'}, {number(process.traceCount)} {process.traceCount === 1 ? 'trace' : 'traces'} ({process.format.toUpperCase()})
                </p>
              </div>
            </div>
          )
        ) : (
          <UploadArea input={input} file={file} uploading={uploading} formatError={formatError} error={uploadError} onPick={choose} onSubmit={upload} />
        )}
        {loaded && <OperationsMapper rows={rows} setRows={setRows} catalog={catalogFor(process.operations, catalog)} />}
      </div>
    </Modal>
  )
}

function UploadArea({ input, file, uploading, formatError, error, onPick, onSubmit }: {
  input: RefObject<HTMLInputElement | null>
  file: File | null
  uploading: boolean
  formatError: boolean
  error: string | null
  onPick: (f: File | null | undefined) => void
  onSubmit: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div>
      <div
        className={`dropzone ${over ? 'over' : ''} ${formatError ? 'error' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); onPick(e.dataTransfer.files?.[0]) }}
      >
        <span className="dropzone-icon"><Upload size={18} /></span>
        <div>
          <p style={{ fontWeight: 500 }}>{uploading ? 'Analisando log…' : file ? file.name : 'Arraste um arquivo aqui'}</p>
          {!file && !uploading && <p className="hint">Formatos aceitos: <span className="mono">.xes</span> e <span className="mono">.csv</span></p>}
          {file && !uploading && <p className="hint">{(file.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</p>}
        </div>
        {formatError && <p className="error-text">Envie um arquivo .xes ou .csv.</p>}
        <input ref={input} type="file" accept=".xes,.csv" hidden disabled={uploading} onChange={(e) => onPick(e.target.files?.[0])} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={uploading}>Selecionar arquivo</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={!file || uploading}>
            {uploading ? <><Loader2 size={14} className="spin" />Analisando…</> : 'Enviar'}
          </button>
        </div>
      </div>
      {error && <p className="error-text" style={{ margin: '12px 0 0' }}>{error}</p>}
    </div>
  )
}
