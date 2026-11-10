import { useEffect, useMemo, useState } from 'react'
import { Loader2, ScanLine } from 'lucide-react'
import { api } from '../../api/client'
import type { AnalysisSummary, Process, ProcessSummary } from '../../api/types'
import { Modal } from '../../components/Modal'
import './analysis-form.css'

const PREFERRED = 'Machine_Operating'

/** Create da Análise ("Gerar Análise de Desvios"): o ipdd grava e pede o ADWIN pela fila. */
export function NewAnalysisModal({ processes, initialProcessId, initialActivity, onClose, onCreated }: {
  processes: ProcessSummary[]
  initialProcessId?: string
  initialActivity?: string | null
  onClose: () => void
  onCreated: (a: AnalysisSummary) => void
}) {
  const ready = processes.filter((p) => p.status === 'pronto')
  const [processId, setProcessId] = useState(initialProcessId ?? ready[0]?.id ?? '')
  const [process, setProcess] = useState<Process | null>(null)
  const [activity, setActivity] = useState<string>(initialActivity ?? '')
  const [name, setName] = useState('')
  const [delta, setDelta] = useState('0,002')
  const [treatment, setTreatment] = useState<'raw' | 'treated'>('raw')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!processId) return
    let alive = true
    setProcess(null)
    api.getProcess(processId).then((p) => {
      if (!alive) return
      setProcess(p)
      const names = p.graph?.nodes.map((n) => n.label) ?? []
      setActivity((a) => (a && names.includes(a) ? a : initialActivity && names.includes(initialActivity) ? initialActivity : names.includes(PREFERRED) ? PREFERRED : ''))
    }).catch(() => alive && setProcess(null))
    return () => { alive = false }
  }, [processId, initialActivity])

  const activities = useMemo(() => [...(process?.graph?.nodes ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [process])
  const deltaValue = Number(delta.replace(',', '.'))
  const deltaOk = deltaValue > 0 && deltaValue < 1

  async function create() {
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.createAnalysis({ processId, name: name.trim() || undefined, delta: deltaValue, treatment, activity: activity || null }))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Gerar análise de desvios"
      description="O ADWIN percorre a série de durações do processo e marca onde o desempenho mudou de patamar."
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text" style={{ marginRight: 'auto' }}>{error}</span>}
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={create} disabled={!processId || !deltaOk || busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <ScanLine size={14} />}Gerar análise
          </button>
        </>
      }
    >
      {ready.length === 0 ? (
        <p className="error-text">Nenhum processo pronto. Envie um log e conclua o mapeamento primeiro.</p>
      ) : (
        <>
          {!initialProcessId && (
            <label>
              <span className="field-label">Processo</span>
              <select className="field" value={processId} onChange={(e) => { setProcessId(e.target.value); setActivity('') }}>
                {ready.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label>
            <span className="field-label">Série analisada</span>
            <select className="field" value={activity} onChange={(e) => setActivity(e.target.value)} disabled={!process}>
              <option value="">Duração total de cada trace</option>
              {activities.map((n) => <option key={n.id} value={n.label}>Tempo em {n.label}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label>
              <span className="field-label">Sensibilidade δ</span>
              <input className="field mono" inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} aria-invalid={!deltaOk} />
            </label>
            <fieldset className="segmented">
              <legend className="field-label">Tratamento da série</legend>
              <div>
                <button type="button" className={treatment === 'raw' ? 'on' : ''} aria-pressed={treatment === 'raw'} onClick={() => setTreatment('raw')}>Bruto</button>
                <button type="button" className={treatment === 'treated' ? 'on' : ''} aria-pressed={treatment === 'treated'} onClick={() => setTreatment('treated')}>Tratado</button>
              </div>
            </fieldset>
          </div>
          <p className="form-note">
            {treatment === 'raw'
              ? 'Bruto: a série entra no ADWIN como veio do log. É o modo que reproduz a pesquisa.'
              : 'Tratado: picos isolados são substituídos pela vizinhança e a série é suavizada por média móvel.'}
            {' '}δ menor deixa o detector mais conservador.
          </p>
          <label>
            <span className="field-label">Nome (opcional)</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={process ? `${process.name}${activity ? ` · ${activity}` : ''} · ${new Date().toLocaleDateString('pt-BR')}` : ''} maxLength={120} />
          </label>
        </>
      )}
    </Modal>
  )
}
