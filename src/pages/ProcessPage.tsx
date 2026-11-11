import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Layers, ListTree, Loader2, ScanLine, Trash2, Upload, X } from 'lucide-react'
import { api } from '../api/client'
import type { GraphNode, Process, ProcessSummary, Trace } from '../api/types'
import { AppHeader } from '../components/AppHeader'
import { InlineName } from '../components/InlineName'
import { ConfirmDelete } from '../components/Modal'
import { Slider } from '../components/Slider'
import { TraceList, type TraceGroup } from '../components/TraceList'
import { ProcessGraph } from '../features/graph/ProcessGraph'
import { END_ID, START_ID, activityColors, filterByDensity, pathColors } from '../features/graph/geometry'
import { NewAnalysisModal } from '../features/analysis/NewAnalysisModal'
import { EventLogModal } from '../features/process/EventLogModal'
import { duration, number } from '../lib/format'
import './process-page.css'

/** O que as cores e as espessuras do grafo mostram. Por ora só a frequência absoluta, que é o que o log mapeado entrega para atividades e caminhos. */
type Metric = 'frequency'

export function ProcessPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [process, setProcess] = useState<Process | null>(null)
  const [traces, setTraces] = useState<Trace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [variant, setVariant] = useState<string | null>(null)
  const [trace, setTrace] = useState<number | null>(null)
  const [showTraces, setShowTraces] = useState(true)
  const [actPct, setActPct] = useState(100)
  const [pathPct, setPathPct] = useState(60)
  const [modal, setModal] = useState<'upload' | 'resume' | 'remap' | 'delete' | 'analysis' | 'analysis-activity' | null>(null)
  const [metric, setMetric] = useState<Metric>('frequency')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let alive = true
    setProcess(null)
    setTraces(null)
    api.getProcess(id).then((p) => alive && setProcess(p)).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (process?.status !== 'pronto' || traces) return
    api.traces(process.id).then(setTraces).catch(() => setTraces([]))
  }, [process, traces])

  const graph = process?.graph
  const filtered = useMemo(() => (graph ? filterByDensity(graph.nodes, graph.edges, actPct, pathPct) : null), [graph, actPct, pathPct])
  const node = graph?.nodes.find((n) => n.id === selected) ?? null
  // as duas escalas do grafo: a atividade mais executada e a transição mais percorrida entre as visíveis
  const scale = useMemo(() => {
    const range = (values: number[]): [number, number] => (values.length ? [Math.min(...values), Math.max(...values)] : [0, 1])
    return {
      activity: range((filtered?.nodes ?? []).map((n) => n.frequency)),
      path: range((filtered?.edges ?? []).filter((e) => e.source !== START_ID && e.target !== END_ID).map((e) => e.frequency)),
    }
  }, [filtered])

  const groups: TraceGroup[] = useMemo(() => {
    if (!process) return []
    const byVariant = new Map<string, Trace[]>()
    for (const t of traces ?? []) {
      if (!t.variantId) continue
      const list = byVariant.get(t.variantId) ?? []
      list.push(t)
      byVariant.set(t.variantId, list)
    }
    return process.variants
      .filter((v) => !node || v.sequence.includes(node.label))
      .map((v) => ({
        id: v.id,
        label: v.label,
        count: v.traceCount,
        detail: `${v.sequence.length} passos · ${(v.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`,
        traces: (byVariant.get(v.id) ?? []).map((t) => ({ index: t.index, seconds: t.durationSeconds, status: 'neutral' as const })),
      }))
  }, [process, traces, node])

  const highlight = useMemo(() => {
    if (trace != null && traces) {
      const t = traces.find((x) => x.index === trace)
      if (t) return new Set(t.activities)
    }
    const v = process?.variants.find((x) => x.id === variant)
    return v ? new Set(v.sequence) : null
  }, [variant, trace, traces, process])

  async function rename(name: string) {
    if (!process) return
    const p = await api.renameProcess(process.id, name)
    setProcess((cur) => (cur ? { ...cur, name: p.name, updatedAt: p.updatedAt } : cur))
  }

  async function remove() {
    setDeleting(true)
    try {
      await api.deleteProcess(id)
      navigate('/app', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
      setModal(null)
    }
  }

  const context = (
    <div className="crumb">
      <Link to="/app">Processos</Link>
      <span className="crumb-sep">/</span>
      {process ? <InlineName value={process.name} onSave={rename} label="Nome do processo" /> : <span>…</span>}
    </div>
  )
  const actions = process && (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setModal('remap')} disabled={process.status !== 'pronto'}><ListTree size={14} />Operações</button>
      <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => setModal('delete')} aria-label="Excluir processo" title="Excluir processo"><Trash2 size={14} /></button>
    </>
  )

  return (
    <div className="page">
      <AppHeader context={context} actions={actions} />
      {error && !process ? (
        <div className="empty"><p>{error}</p><Link to="/app">Voltar ao dashboard</Link></div>
      ) : !process ? (
        <div className="loading"><Loader2 size={16} className="spin" />Carregando processo…</div>
      ) : process.status !== 'pronto' || !filtered ? (
        <EmptyCanvas process={process} onUpload={() => setModal('upload')} onResume={() => setModal('resume')} />
      ) : (
        <div className="page-body">
          {showTraces && (
            <TraceList
              groups={groups}
              groupNoun={{ one: 'variante', many: 'variantes' }}
              selectedGroup={variant}
              onSelectGroup={(g) => { setTrace(null); setVariant((cur) => (cur === g ? null : g)) }}
              selectedTrace={trace}
              onSelectTrace={(t) => setTrace((cur) => (cur === t ? null : t))}
              onClose={() => setShowTraces(false)}
            />
          )}
          <div className="canvas-wrap">
            <ProcessGraph nodes={filtered.nodes} edges={filtered.edges} selectedId={selected} onSelect={setSelected} highlight={highlight} />
            {!showTraces && (
              <button type="button" className="float-toggle" onClick={() => setShowTraces(true)}>
                <Layers size={14} />{number(process.traceCount)} traces · {process.variants.length} variantes
              </button>
            )}
            {(variant || trace != null) && (
              <button type="button" className="float-chip" onClick={() => { setVariant(null); setTrace(null) }}>
                Destacando {trace != null ? `CASE-${String(trace).padStart(4, '0')}` : process.variants.find((v) => v.id === variant)?.label}<X size={12} />
              </button>
            )}
          </div>
          <aside className="side" aria-label="Painel do processo e da atividade">
            <div className="side-scroll">
              {/* tudo o que fica fora do computador de bordo vale para o processo inteiro e não muda com a seleção */}
              <section className="side-section" aria-label="Processo">
                <dl className="process-facts">
                  <div><dt>Traces</dt><dd>{number(process.traceCount)}</dd></div>
                  <div><dt>Eventos</dt><dd>{number(process.eventCount)}</dd></div>
                  <div><dt>Variantes</dt><dd>{number(process.variantCount)}</dd></div>
                </dl>
              </section>
              <section className="side-section" aria-label="Densidade do grafo">
                <Slider label="Atividades" value={actPct} onChange={setActPct} />
                <Slider label="Caminhos" value={pathPct} onChange={setPathPct} />
                <div className="density-count">
                  <span><b>{filtered.nodes.length}</b> de {graph!.nodes.length} atividades</span>
                  <span><b>{filtered.edges.length}</b> caminhos</span>
                </div>
              </section>
              <section className="side-section" aria-label="O que o grafo mostra">
                <select className="field metric" aria-label="Mostrar" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
                  <option value="frequency">Frequência absoluta</option>
                </select>
                <FrequencyScales activity={scale.activity} path={scale.path} />
              </section>
              <ActivityBoard node={node} onClose={() => setSelected(null)} onAnalyse={() => setModal('analysis-activity')} />
            </div>
            <div className="side-foot">
              <span className="side-scope">Processo inteiro: duração total de cada trace</span>
              <button type="button" className="btn btn-primary" onClick={() => setModal('analysis')}><ScanLine size={14} />Gerar Análise de Desvios</button>
            </div>
          </aside>
        </div>
      )}

      {(modal === 'upload' || modal === 'resume' || modal === 'remap') && process && (
        <EventLogModal
          process={process}
          mode={modal}
          onClose={(p) => { setProcess(p); setModal(null) }}
          onDone={(p) => { setProcess(p); setTraces(null); setSelected(null); setVariant(null); setTrace(null); setModal(null) }}
        />
      )}
      {modal === 'delete' && process && (
        <ConfirmDelete
          title="Excluir processo"
          message={`“${process.name}” e todas as análises geradas a partir dele serão excluídos.`}
          busy={deleting}
          onCancel={() => setModal(null)}
          onConfirm={remove}
        />
      )}
      {(modal === 'analysis' || modal === 'analysis-activity') && process && (
        <NewAnalysisModal
          processes={[process as ProcessSummary]}
          initialProcessId={process.id}
          initialActivity={modal === 'analysis-activity' ? node?.label ?? null : null}
          onClose={() => setModal(null)}
          onCreated={(a) => navigate(`/analises/${a.id}`)}
        />
      )}
    </div>
  )
}

/** Processo sem log (vazio) ou com mapeamento pendente: diz isso e oferece o próximo passo. */
function EmptyCanvas({ process, onUpload, onResume }: { process: Process; onUpload: () => void; onResume: () => void }) {
  const mapping = process.status === 'mapeando'
  return (
    <div className="empty-canvas">
      <div className="empty-canvas-inner">
        <span className="empty-canvas-icon"><Upload size={18} /></span>
        <div>
          <p className="empty-canvas-title">{mapping ? 'Mapeamento pendente' : 'Nenhum log de eventos neste processo'}</p>
          <p className="empty-canvas-text">
            {mapping
              ? `${process.fileName} foi carregado (${number(process.traceCount)} traces). Associe cada evento a uma atividade para desenhar o grafo.`
              : 'O grafo é derivado do log de eventos. Envie um arquivo .xes ou .csv para desenhar este processo.'}
          </p>
        </div>
        <div className="empty-canvas-actions">
          {mapping ? (
            <>
              <button type="button" className="btn" onClick={onUpload}><Upload size={14} />Carregar outro log</button>
              <button type="button" className="btn btn-primary" onClick={onResume}><ListTree size={14} />Continuar mapeamento</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onUpload}><Upload size={14} />Carregar log de eventos</button>
          )}
        </div>
      </div>
    </div>
  )
}

const SCALE_STEPS = [0, 0.25, 0.5, 0.75, 1]
const SCALE_HEIGHTS = [3, 5, 8, 12, 18]

/** Legenda das duas escalas de frequência absoluta, nas cores do grafo: azul nas atividades, cinza nos caminhos. */
function FrequencyScales({ activity, path }: { activity: [number, number]; path: [number, number] }) {
  // cada barra usa a cor que aquele nível de frequência tem no grafo
  const bars = (background: (f: number) => string) =>
    SCALE_STEPS.map((f, i) => <span key={f} style={{ height: SCALE_HEIGHTS[i], background: background(f) }} />)
  return (
    <div className="scales">
      <div className="scale-ends"><span>{number(activity[0])}</span><span>atividades</span><span>{number(activity[1])}</span></div>
      <div className="scale-bars scale-up" aria-hidden="true">{bars((f) => `linear-gradient(90deg, ${activityColors(f).light}, ${activityColors(f).deep})`)}</div>
      <div className="scale-bars scale-down" aria-hidden="true">{bars((f) => `linear-gradient(90deg, ${pathColors(f).to}, ${pathColors(f).from})`)}</div>
      <div className="scale-ends"><span>{number(path[0])}</span><span>caminhos</span><span>{number(path[1])}</span></div>
    </div>
  )
}

/** Computador de bordo: só o que está aqui dentro se refere à atividade selecionada no grafo. */
function ActivityBoard({ node, onClose, onAnalyse }: { node: GraphNode | null; onClose: () => void; onAnalyse: () => void }) {
  const [tab, setTab] = useState<'freq' | 'perf'>('freq')
  const max = Math.max(1, ...(node?.histogram ?? []))
  return (
    <section className={`board${node ? ' is-on' : ''}`} aria-label="Computador de bordo da atividade">
      <header className="board-head">
        <span className="board-led" aria-hidden="true" />
        <h3>{node ? node.label : 'Nenhuma atividade selecionada'}</h3>
        {node && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar atividade"><X size={14} /></button>}
      </header>
      {!node ? (
        <p className="board-idle">Clique em uma atividade do grafo para ver os dados dela.</p>
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'freq'} onClick={() => setTab('freq')}>Frequência</button>
            <button type="button" role="tab" aria-selected={tab === 'perf'} onClick={() => setTab('perf')}>Desempenho</button>
          </div>
          <div className="board-body">
            {tab === 'freq' ? (
              <>
                <div className="readout"><span>Frequência absoluta</span><strong>{number(node.frequency)}</strong></div>
                <div className="stat-row"><span>Traces com a atividade</span><span>{number(node.caseFrequency)}</span></div>
                <div className="stat-row"><span>Máx. repetições no trace</span><span>{node.maxRepetitions}×</span></div>
                <div className="stat-row"><span>Inicia o trace</span><span>{number(node.startFrequency)}</span></div>
                <div className="stat-row"><span>Encerra o trace</span><span>{number(node.endFrequency)}</span></div>
              </>
            ) : (
              <>
                <div className="readout"><span>Duração média</span><strong>{duration(node.meanDurationSeconds)}</strong></div>
                <div className="stat-row"><span>Duração total</span><span>{duration(node.totalDurationSeconds)}</span></div>
                <div className="stat-row"><span>Duração mediana</span><span>{duration(node.medianDurationSeconds)}</span></div>
                <div className="stat-row"><span>Duração mínima</span><span>{duration(node.minDurationSeconds)}</span></div>
                <div className="stat-row"><span>Duração máxima</span><span>{duration(node.maxDurationSeconds)}</span></div>
                {node.histogram.length > 0 && (
                  <div className="histogram">
                    <span className="field-label">Distribuição da duração</span>
                    <div className="histogram-bars">
                      {node.histogram.map((v, i) => <span key={i} title={`${v} ocorrências`} style={{ height: `${Math.max(4, (v / max) * 100)}%`, opacity: 0.35 + (v / max) * 0.65 }} />)}
                    </div>
                    <div className="legend-ends"><span>{duration(node.minDurationSeconds)}</span><span>{duration(node.maxDurationSeconds)}</span></div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="board-foot">
            <button type="button" className="btn btn-sm" onClick={onAnalyse}><ScanLine size={14} />Analisar desvios desta atividade</button>
          </div>
        </>
      )}
    </section>
  )
}
