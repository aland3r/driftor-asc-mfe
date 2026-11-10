import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Loader2, Trash2, TrendingDown, TrendingUp, XCircle } from 'lucide-react'
import { Brush, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import type { AggregatedData, Analysis } from '../api/types'
import { AppHeader } from '../components/AppHeader'
import { InlineName } from '../components/InlineName'
import { ConfirmDelete } from '../components/Modal'
import { TraceList, type TraceGroup, type TraceStatus } from '../components/TraceList'
import { caseLabel, delta, duration, number, percent, treatmentLabel } from '../lib/format'
import './analysis-page.css'

interface Row { x: number; pos: number; original: number; treated: number | null; outlier: number | null; status: TraceStatus }

const SOURCE_LABEL = { ipdd: 'ipdd', pmining: 'pmining', fnAdwin: 'Function ADWIN' } as const

export function AnalysisPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<AggregatedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [segment, setSegment] = useState<string | null>(null)
  const [driftPos, setDriftPos] = useState<number>(0)
  const [selectedTrace, setSelectedTrace] = useState<number | null>(null)
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => api.aggregated(id).then((d) => {
      if (!alive) return
      setData(d)
      if (d.analysis?.status === 'em_andamento') timer = setTimeout(load, 2500)
    }).catch((e) => alive && setError(e.message))
    load()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [id])

  const analysis = data?.analysis ?? null

  const outliers = useMemo(() => new Set(analysis?.treatment === 'treated' ? analysis.outlierIndices : data?.treatedSeries?.outlierIndices ?? []), [analysis, data])
  const driftAt = useMemo(() => new Set(analysis?.drifts.map((d) => d.index) ?? []), [analysis])

  const rows: Row[] = useMemo(() => {
    if (!analysis) return []
    const treated = data?.treatedSeries?.processedValues
    return analysis.points.map((p, pos) => {
      const status: TraceStatus = driftAt.has(pos) ? 'drift' : outliers.has(pos) ? 'outlier' : 'normal'
      return { x: p.index, pos, original: p.value, treated: treated?.[pos] ?? null, outlier: outliers.has(pos) ? p.value : null, status }
    })
  }, [analysis, data, outliers, driftAt])

  const groups: TraceGroup[] = useMemo(() => (analysis?.segments ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    count: s.traceCount,
    driftCount: s.driftCount,
    outlierCount: s.outlierCount,
    detail: `média ${duration(s.mean)}`,
    traces: rows.slice(s.startIndex, s.endIndex + 1).map((r) => ({ index: r.x, seconds: r.original, status: r.status })),
  })), [analysis, rows])

  async function rename(name: string) {
    if (!analysis) return
    const a = await api.renameAnalysis(analysis.id, name)
    setData((d) => (d && d.analysis ? { ...d, analysis: { ...d.analysis, name: a.name } } : d))
  }

  async function remove() {
    setDeleting(true)
    try {
      await api.deleteAnalysis(id)
      navigate('/app', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
      setConfirm(false)
    }
  }

  function focusSegment(segId: string) {
    const s = analysis?.segments.find((x) => x.id === segId)
    setSegment((cur) => (cur === segId ? null : segId))
    if (!s || segment === segId) { setRange(null); return }
    const pad = Math.round((s.endIndex - s.startIndex) * 0.05)
    setRange({ start: Math.max(0, s.startIndex - pad), end: Math.min(rows.length - 1, s.endIndex + pad) })
    // o segmento N começa no desvio N-1: mostra esse desvio no painel
    const order = analysis!.segments.indexOf(s)
    if (order > 0 && analysis!.drifts[order - 1]) setDriftPos(order - 1)
  }

  const context = (
    <div className="crumb">
      <Link to="/app">Análises</Link>
      <span className="crumb-sep">/</span>
      {analysis && <><Link to={`/processos/${analysis.processId}`} className="crumb-process">{analysis.processName}</Link><span className="crumb-sep">/</span></>}
      {analysis ? <InlineName value={analysis.name} onSave={rename} label="Nome da análise" /> : <span>…</span>}
    </div>
  )
  const actions = analysis && (
    <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => setConfirm(true)} aria-label="Excluir análise" title="Excluir análise"><Trash2 size={14} /></button>
  )

  const selectedSegment = analysis?.segments.find((s) => s.id === segment) ?? null
  const drift = analysis?.drifts[driftPos] ?? null
  const trace = selectedTrace != null ? rows.find((r) => r.x === selectedTrace) ?? null : null

  return (
    <div className="page">
      <AppHeader context={context} actions={actions} />
      {error && !data ? (
        <div className="empty"><p>{error}</p><Link to="/app">Voltar ao dashboard</Link></div>
      ) : !data ? (
        <div className="loading"><Loader2 size={16} className="spin" />Carregando análise…</div>
      ) : !analysis ? (
        <div className="empty"><p>Análise não encontrada.</p><Link to="/app">Voltar ao dashboard</Link></div>
      ) : (
        <div className="page-body">
          {analysis.status === 'concluida' && (
            <TraceList
              groups={groups}
              groupNoun={{ one: 'segmento', many: 'segmentos' }}
              selectedGroup={segment}
              onSelectGroup={focusSegment}
              selectedTrace={selectedTrace}
              onSelectTrace={(t) => setSelectedTrace((cur) => (cur === t ? null : t))}
            />
          )}
          <main className="analysis-main">
            <SummaryStrip analysis={analysis} segmentLabel={selectedSegment?.label ?? 'Série completa'} traces={selectedSegment?.traceCount ?? analysis.observationCount} drifts={selectedSegment ? selectedSegment.driftCount : analysis.driftCount} outliers={selectedSegment ? selectedSegment.outlierCount : outliers.size} />
            {analysis.status === 'em_andamento' ? (
              <div className="state"><Loader2 size={28} className="spin" /><p>Processando {number(analysis.observationCount)} traces na Function…</p><p className="state-sub">O resultado chega pela fila analysis-completed e a tela atualiza sozinha.</p></div>
            ) : analysis.status === 'falhou' ? (
              <div className="state"><XCircle size={28} color="var(--amber)" /><p>A análise falhou</p><p className="state-sub">{analysis.error ?? 'Erro desconhecido.'}</p></div>
            ) : (
              <SeriesChart
                rows={rows}
                analysis={analysis}
                hasTreated={!!data.treatedSeries}
                selectedDrift={driftPos}
                selectedTrace={selectedTrace}
                range={range}
                onRange={setRange}
                onPick={(x) => {
                  setSelectedTrace(x)
                  const pos = rows.findIndex((r) => r.x === x)
                  const near = analysis.drifts.findIndex((d) => Math.abs(d.index - pos) <= Math.max(3, rows.length * 0.01))
                  if (near >= 0) setDriftPos(near)
                }}
              />
            )}
          </main>
          {analysis.status === 'concluida' && (
            <aside className="side drift-side" aria-label="Detalhe do desvio">
              {analysis.drifts.length === 0 ? (
                <div className="side-section no-drift">
                  <CheckCircle2 size={20} color="var(--green)" />
                  <p>Nenhum desvio detectado</p>
                  <p className="state-sub">Com δ {delta(analysis.delta)}, o ADWIN não encontrou mudança de patamar na série.</p>
                </div>
              ) : drift && (
                <div className="side-section">
                  <div className="drift-head">
                    <span className="drift-title"><i className="dot dot-drift" />Desvio {driftPos + 1} de {analysis.drifts.length}</span>
                  </div>
                  <div className="drift-chips">
                      {analysis.drifts.map((d, i) => (
                        <button key={d.position} type="button" className={i === driftPos ? 'on' : ''} onClick={() => setDriftPos(i)} aria-label={`Desvio ${i + 1}`} aria-pressed={i === driftPos}>D{i + 1}</button>
                      ))}
                  </div>
                  <dl className="drift-grid">
                    <div><dt>Detectado em</dt><dd>{caseLabel(rows[drift.index]?.x ?? drift.index + 1)}</dd></div>
                    <div><dt>Início estimado</dt><dd>{caseLabel(rows[drift.anomalyStartIndex]?.x ?? drift.anomalyStartIndex + 1)}</dd></div>
                    <div><dt>Média antes</dt><dd>{duration(drift.meanBefore)}</dd></div>
                    <div><dt>Média depois</dt><dd>{duration(drift.meanAfter)}</dd></div>
                    <div><dt>Variação</dt><dd className={drift.changePercent > 0 ? 'up' : 'down'}>{percent(drift.changePercent)}</dd></div>
                    <div><dt>Janela ADWIN</dt><dd>{number(Math.round(drift.width))} traces</dd></div>
                  </dl>
                  <p className="drift-trend">
                    {drift.changePercent > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    A duração {drift.changePercent > 0 ? 'aumentou' : 'diminuiu'} {percent(Math.abs(drift.changePercent)).replace('+', '')} a partir de {caseLabel(rows[drift.anomalyStartIndex]?.x ?? drift.anomalyStartIndex + 1)}.
                  </p>
                </div>
              )}
              {trace && (
                <div className="side-section">
                  <h2 className="panel-title">Trace selecionado</h2>
                  <div className="trace-pick">
                    <i className={`dot dot-${trace.status}`} />
                    <span className="mono">{caseLabel(trace.x)}</span>
                    <span className="mono muted">{duration(trace.original)}</span>
                  </div>
                  <p className="state-sub" style={{ margin: 0 }}>
                    {trace.status === 'drift' ? 'Ponto onde o ADWIN detectou o desvio.' : trace.status === 'outlier' ? 'Pico isolado, substituído pela vizinhança na série tratada.' : 'Dentro do patamar do segmento.'}
                    {' '}Caso {analysis.points[trace.pos]?.caseId} no log.
                  </p>
                </div>
              )}
              <div className="side-foot sources">
                <span className="field-label" style={{ margin: 0 }}>Composto pelo BFF em /aggregated-data</span>
                <ul>
                  {data.sources.map((s) => (
                    <li key={s.source}><i className={`dot ${s.ok ? 'dot-normal' : 'dot-outlier'}`} />{SOURCE_LABEL[s.source]}<span className="mono">{s.ok ? `${s.ms} ms` : 'indisponível'}</span></li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </div>
      )}
      {confirm && analysis && (
        <ConfirmDelete title="Excluir análise" message={`“${analysis.name}” e seus desvios serão excluídos. O processo continua disponível.`} busy={deleting} onCancel={() => setConfirm(false)} onConfirm={remove} />
      )}
    </div>
  )
}

function SummaryStrip({ analysis, segmentLabel, traces, drifts, outliers }: { analysis: Analysis; segmentLabel: string; traces: number; drifts: number; outliers: number }) {
  const stats: [string, string, string?][] = [
    ['Recorte', segmentLabel],
    ['Traces', number(traces)],
    ['Desvios', number(drifts), drifts ? 'drift' : undefined],
    ['Outliers', number(outliers), outliers ? 'outlier' : undefined],
    ['Série', analysis.activity ? `Tempo em ${analysis.activity}` : 'Duração do trace'],
    ['δ · tratamento', `${delta(analysis.delta)} · ${treatmentLabel(analysis.treatment)}`],
  ]
  return (
    <div className="summary-strip">
      {stats.map(([k, v, tone]) => (
        <div key={k}><span>{k}</span><strong className={tone ? `tone-${tone}` : ''} title={v}>{v}</strong></div>
      ))}
    </div>
  )
}

function SeriesChart({ rows, analysis, hasTreated, selectedDrift, selectedTrace, range, onRange, onPick }: {
  rows: Row[]
  analysis: Analysis
  hasTreated: boolean
  selectedDrift: number
  selectedTrace: number | null
  range: { start: number; end: number } | null
  onRange: (r: { start: number; end: number } | null) => void
  onPick: (x: number) => void
}) {
  const axis = { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fill: '#91a0b5' }
  const xOf = (pos: number) => rows[Math.min(rows.length - 1, Math.max(0, pos))]?.x ?? pos + 1
  // eixo no intervalo dos dados (com folga), não a partir de zero: a mudança de patamar fica visível
  const yDomain = useMemo(() => {
    const visible = range ? rows.slice(range.start, range.end + 1) : rows
    const values = visible.flatMap((r) => (r.treated != null ? [r.original, r.treated] : [r.original]))
    if (!values.length) return [0, 1]
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo || hi || 1) * 0.08
    return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)]
  }, [rows, range])
  return (
    <div className="chart">
      <div className="chart-legend">
        <span className="chart-title">{analysis.activity ? `Tempo em ${analysis.activity}` : 'Duração'} por trace</span>
        <span><i className="sw sw-original" />original</span>
        {hasTreated && <span><i className="sw sw-treated" />tratada (Function)</span>}
        <span><i className="dot dot-outlier" />outlier</span>
        <span><i className="sw sw-drift" />desvio</span>
      </div>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 22, right: 24, bottom: 4, left: 8 }}
            onClick={(e: any) => { const x = e?.activePayload?.[0]?.payload?.x; if (x != null) onPick(x) }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} minTickGap={32} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={76} domain={yDomain} allowDataOverflow tickFormatter={(v: number) => duration(v)} />
            <Tooltip content={<ChartTip />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} isAnimationActive={false} />
            {analysis.drifts.map((d, i) => (
              <ReferenceArea key={`a${d.position}`} x1={xOf(d.anomalyStartIndex)} x2={xOf(d.index)} fill={i === selectedDrift ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.05)'} stroke="none" ifOverflow="hidden" />
            ))}
            {analysis.drifts.map((d, i) => (
              <ReferenceLine
                key={`l${d.position}`}
                x={xOf(d.index)}
                stroke={i === selectedDrift ? '#dc2626' : 'rgba(220,38,38,0.45)'}
                strokeWidth={i === selectedDrift ? 1.5 : 1}
                strokeDasharray="5 3"
                label={{ value: `D${i + 1}`, position: 'top', fill: i === selectedDrift ? '#fca5a5' : 'rgba(252,165,165,0.7)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
              />
            ))}
            {selectedTrace != null && <ReferenceLine x={selectedTrace} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />}
            <Line type="linear" dataKey="original" stroke={hasTreated ? 'rgba(184,216,238,0.4)' : '#4d8fc0'} strokeWidth={1} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            {hasTreated && <Line type="monotone" dataKey="treated" stroke="#4d8fc0" strokeWidth={1.75} dot={false} activeDot={false} isAnimationActive={false} />}
            <Scatter dataKey="outlier" fill="#f59e0b" shape={(p: any) => (p.payload?.outlier == null ? <g /> : <circle cx={p.cx} cy={p.cy} r={3.5} fill="#f59e0b" stroke="#1b2533" strokeWidth={1} />)} isAnimationActive={false} />
            <Brush
              dataKey="x"
              height={24}
              stroke="rgba(255,255,255,0.14)"
              fill="#1b2533"
              travellerWidth={8}
              startIndex={range?.start}
              endIndex={range?.end}
              onChange={(r: any) => { if (r?.startIndex != null) onRange({ start: r.startIndex, end: r.endIndex }) }}
              tickFormatter={(v: number) => caseLabel(v)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const r: Row = payload[0].payload
  return (
    <div className="chart-tip">
      <p>{caseLabel(r.x)}</p>
      <p className={r.status === 'outlier' ? 'tone-outlier' : ''}>{duration(r.original)}{r.status === 'outlier' ? ' · outlier' : ''}</p>
      {r.treated != null && <p className="muted">tratada {duration(r.treated)}</p>}
      {r.status === 'drift' && <p className="tone-drift">ponto de desvio</p>}
    </div>
  )
}
