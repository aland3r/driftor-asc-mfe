import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, MoreHorizontal, Pencil, Plus, ScanLine, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { AnalysisSummary, Overview, ProcessSummary } from '../api/types'
import { AppHeader } from '../components/AppHeader'
import { ConfirmDelete } from '../components/Modal'
import { NewAnalysisModal } from '../features/analysis/NewAnalysisModal'
import { NewProcessModal } from '../features/process/NewProcessModal'
import { number, relative } from '../lib/format'
import './dashboard.css'

type Item =
  | { kind: 'processo'; id: string; name: string; updatedAt: string; data: ProcessSummary }
  | { kind: 'analise'; id: string; name: string; updatedAt: string; data: AnalysisSummary }

export function DashboardPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'process' | 'analysis' | null>(null)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.overview().then((o) => { setOverview(o); setError(null) }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  useEffect(() => {
    // análise em andamento: atualiza até a Function devolver o resultado
    if (!overview?.analyses?.some((a) => a.status === 'em_andamento')) return
    const t = setTimeout(load, 3000)
    return () => clearTimeout(t)
  }, [overview])

  const processes = overview?.processes ?? []
  const items: Item[] = [
    ...processes.map((p) => ({ kind: 'processo' as const, id: p.id, name: p.name, updatedAt: p.updatedAt, data: p })),
    ...(overview?.analyses ?? []).map((a) => ({ kind: 'analise' as const, id: a.id, name: a.name, updatedAt: a.updatedAt, data: a })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  async function rename(item: Item, name: string) {
    if (item.kind === 'processo') await api.renameProcess(item.id, name)
    else await api.renameAnalysis(item.id, name)
    await load()
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      if (deleting.kind === 'processo') await api.deleteProcess(deleting.id)
      else await api.deleteAnalysis(deleting.id)
      setDeleting(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unavailable = overview?.sources.filter((s) => !s.ok) ?? []

  return (
    <div className="page">
      <AppHeader
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={() => setModal('analysis')} disabled={!processes.some((p) => p.status === 'pronto')}><ScanLine size={14} />Nova análise</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setModal('process')}><Plus size={14} />Novo processo</button>
          </>
        }
      />
      <main className="dash">
        <div className="dash-head">
          <h1>Processos e análises</h1>
          <p>Crie um processo e carregue o log de eventos para minerar o grafo; a partir dele, gere análises de desvio de desempenho.</p>
        </div>
        {unavailable.length > 0 && (
          <p className="dash-warn">Parte dos dados não carregou: {unavailable.map((s) => (s.source === 'pmining' ? 'processos' : s.source === 'ipdd' ? 'análises' : 'Function')).join(', ')} indisponível no momento.</p>
        )}
        {error && !overview ? (
          <div className="empty"><p>{error}</p><button type="button" className="btn" onClick={load}>Tentar de novo</button></div>
        ) : !overview ? (
          <div className="loading" style={{ padding: 48 }}><Loader2 size={16} className="spin" />Carregando…</div>
        ) : items.length === 0 ? (
          <div className="dash-empty">
            <p className="dash-empty-title">Nenhum processo ainda</p>
            <p>Crie um processo e carregue um log de eventos .xes ou .csv para ver o grafo.</p>
            <button type="button" className="btn btn-primary" onClick={() => setModal('process')}><Plus size={14} />Novo processo</button>
          </div>
        ) : (
          <ul className="cards">
            {items.map((item) => (
              <ProjectCard
                key={`${item.kind}-${item.id}`}
                item={item}
                onOpen={() => navigate(item.kind === 'processo' ? `/processos/${item.id}` : `/analises/${item.id}`)}
                onRename={(n) => rename(item, n)}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </ul>
        )}
      </main>

      {modal === 'process' && <NewProcessModal onClose={() => setModal(null)} onCreated={(p) => navigate(`/processos/${p.id}`)} />}
      {modal === 'analysis' && <NewAnalysisModal processes={processes} onClose={() => setModal(null)} onCreated={(a) => navigate(`/analises/${a.id}`)} />}
      {deleting && (
        <ConfirmDelete
          title={deleting.kind === 'processo' ? 'Excluir processo' : 'Excluir análise'}
          message={deleting.kind === 'processo' ? `“${deleting.name}” e todas as análises geradas a partir dele serão excluídos.` : `“${deleting.name}” e seus desvios serão excluídos.`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </div>
  )
}

function ProjectCard({ item, onOpen, onRename, onDelete }: { item: Item; onOpen: () => void; onRename: (name: string) => Promise<void>; onDelete: () => void }) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  async function commit() {
    setEditing(false)
    const name = draft.trim()
    if (name && name !== item.name) await onRename(name).catch(() => setDraft(item.name))
    else setDraft(item.name)
  }

  const meta = item.kind === 'processo'
    ? item.data.status === 'pronto' ? `${number(item.data.traceCount)} traces · ${item.data.variantCount} ${item.data.variantCount === 1 ? 'variante' : 'variantes'}` : item.data.status === 'vazio' ? 'Sem log de eventos' : 'Mapeamento pendente'
    : item.data.status === 'em_andamento' ? 'Processando…' : item.data.status === 'falhou' ? 'Falhou' : `${item.data.driftCount} ${item.data.driftCount === 1 ? 'desvio' : 'desvios'} · ${item.data.processName}`

  return (
    <li className="card">
      <button type="button" className="card-hit" onClick={onOpen} aria-label={`Abrir ${item.kind === 'processo' ? 'processo' : 'análise'} ${item.name}`} />
      <div className="card-thumb" aria-hidden="true">
        {item.kind === 'processo' ? <ProcessThumb /> : <AnalysisThumb drifts={item.data.driftCount} />}
      </div>
      <div className="card-menu" ref={menuRef}>
        <button type="button" className="card-menu-btn" onClick={() => setMenu((m) => !m)} aria-label="Ações" aria-expanded={menu}><MoreHorizontal size={16} /></button>
        {menu && (
          <div className="menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenu(false); setEditing(true) }}><Pencil size={14} />Renomear</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onDelete() }}><Trash2 size={14} />Excluir</button>
          </div>
        )}
      </div>
      <div className="card-info">
        <div className="card-name">
          <span className={`kind kind-${item.kind}`} title={item.kind === 'processo' ? 'Processo' : 'Análise'} />
          {editing ? (
            <input
              autoFocus
              className="inline-name-input"
              aria-label="Novo nome"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(item.name); setEditing(false) } }}
            />
          ) : <span className="card-title" title={item.name}>{item.name}</span>}
        </div>
        <p className="card-meta">
          <span className={item.kind === 'analise' && item.data.status === 'falhou' ? 'tone-outlier' : ''}>{item.kind === 'processo' ? 'Processo' : 'Análise'} · {meta}</span>
        </p>
        <p className="card-time">Editado {relative(item.updatedAt)}</p>
      </div>
    </li>
  )
}

function ProcessThumb() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 220 130" fill="none" preserveAspectRatio="xMidYMid meet">
      <path d="M 52 30 C 90 30 90 65 110 65" stroke="#2870a8" strokeWidth="2.5" />
      <path d="M 120 65 C 136 65 136 30 155 30" stroke="#4d8fc0" strokeWidth="1.8" />
      <path d="M 120 65 C 136 65 136 100 155 100" stroke="#2870a8" strokeWidth="3.2" />
      <path d="M 179 30 C 190 30 190 65 195 65" stroke="#4d8fc0" strokeWidth="1.4" />
      <path d="M 179 100 C 190 100 190 65 195 65" stroke="#2870a8" strokeWidth="2.4" />
      <circle cx="40" cy="30" r="12" fill="#202b3a" stroke="#10b981" strokeWidth="1.5" />
      <rect x="100" y="55" width="20" height="20" rx="5" fill="#263243" stroke="#4d8fc0" />
      <rect x="155" y="20" width="24" height="20" rx="5" fill="#263243" stroke="#3a7db8" />
      <rect x="155" y="90" width="24" height="20" rx="5" fill="#263243" stroke="#2870a8" />
      <circle cx="205" cy="65" r="10" fill="#202b3a" stroke="#94a3b8" />
    </svg>
  )
}

function AnalysisThumb({ drifts }: { drifts: number }) {
  const lines = [121, 75, 165].slice(0, Math.min(drifts, 3))
  return (
    <svg width="100%" height="100%" viewBox="0 0 220 130" fill="none" preserveAspectRatio="xMidYMid meet">
      {[40, 70, 100].map((y) => <line key={y} x1="30" y1={y} x2="200" y2={y} stroke="rgba(255,255,255,0.05)" />)}
      <path d="M 30 88 L 53 80 L 87 68 L 121 74 L 155 50 L 189 65 L 200 58" stroke="#4d8fc0" strokeWidth="2" />
      <path d="M 30 91 L 53 84 L 87 72 L 121 70 L 155 56 L 189 61 L 200 60" stroke="#b8d8ee" strokeWidth="1" opacity=".42" />
      {lines.map((x) => <line key={x} x1={x} y1="22" x2={x} y2="110" stroke="#dc2626" strokeDasharray="4 3" opacity=".7" />)}
      <line x1="30" y1="110" x2="200" y2="110" stroke="rgba(255,255,255,0.12)" />
    </svg>
  )
}
