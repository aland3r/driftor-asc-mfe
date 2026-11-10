import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '../../api/client'
import type { Process } from '../../api/types'
import { Modal } from '../../components/Modal'

/** Create do CRUD de processos: só o nome. O log de eventos é carregado na página do processo. */
export function NewProcessModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Process) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.createProcess(name.trim()))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Novo processo"
      description="Dê um nome ao processo. Depois você carrega o log de eventos e mapeia as atividades."
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text" style={{ marginRight: 'auto' }}>{error}</span>}
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => submit()} disabled={!name.trim() || busy}>
            {busy ? <><Loader2 size={14} className="spin" />Criando…</> : 'Criar processo'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label>
          <span className="field-label">Nome do processo</span>
          <input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Torno 02, linha de usinagem" maxLength={80} />
        </label>
      </form>
    </Modal>
  )
}
