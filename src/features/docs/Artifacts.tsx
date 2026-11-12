import { ArrowUpDown, ArrowUpRight, BadgeCheck, Briefcase, ChevronRight, CircleHelp, Link, List, Maximize2, Shapes, Users, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Arc42Section } from './arc42'
import { DiagramZoom, mermaidMarkup } from './Mermaid'

/*
  Artefatos obrigatórios da entrega: atalhos para o C4 dentro do arc42,
  o Architecture Communication Canvas do Driftor e os links que viram prints.
*/

export const ARTIFACT_SUBS = [
  { id: 'c4', title: 'C4 Model' },
  { id: 'canvas', title: 'Canvas' },
  { id: 'prints', title: 'Prints e links' },
]

/** Código Mermaid do primeiro diagrama da subseção (ex.: 5.2) dentro da seção. */
function diagramOf(sections: Arc42Section[], section: string, sub: string) {
  const body = sections.find((s) => s.id === section)?.body ?? ''
  const at = body.search(new RegExp(`^###\\s+${sub.replace('.', '\\.')}\\s`, 'm'))
  if (at < 0) return null
  return /```mermaid\n([\s\S]*?)```/.exec(body.slice(at))?.[1] ?? null
}

const C4 = [
  { level: 'Nível 1', title: 'Contexto', where: '3.1 Contexto de negócio', section: '3', sub: '3.1' },
  { level: 'Nível 2', title: 'Containers', where: '5.1 Containers', section: '5', sub: '5.1' },
  { level: 'Nível 3', title: 'Componentes', where: '5.2 Componentes do ipdd', section: '5', sub: '5.2' },
]

type Tone = 'req' | 'sol' | 'risk'
interface Block { area: string; tone: Tone; title: string; original: string; items: string[] }

const ICON: Record<string, LucideIcon> = { vp: Briefcase, ks: Users, cf: List, qr: BadgeCheck, cd: ArrowUpDown, tech: Wrench, bc: Link, comp: Shapes, risk: CircleHelp }

const META = [
  { label: 'Sistema', value: 'Driftor ASC' },
  { label: 'Criado por', value: 'Alander Menezes Arantes de Ávila, Emanuelle Skolut Jose' },
  { label: 'Criado para', value: 'Arquitetura e Soluções Cloud, PUCPR' },
  { label: 'Data / iteração', value: '12/11/2026 · Entrega 3' },
]

const CANVAS: Block[] = [
  { area: 'vp', tone: 'req', title: 'Proposta de valor', original: 'Value Proposition', items: [
    'Ver quando o processo produtivo mudou de ritmo, direto do event log da fábrica.',
    'ADWIN do método IPDD com os resultados publicados.',
  ] },
  { area: 'ks', tone: 'req', title: 'Stakeholders', original: 'Key Stakeholders', items: [
    'Analista de processo (usuário)',
    'Autora do framework IPDD',
    'Professor de Arquitetura e Soluções Cloud',
    'Grupo de desenvolvimento',
  ] },
  { area: 'cf', tone: 'req', title: 'Funções principais', original: 'Core Functions', items: [
    'CRUD do Processo: criar, carregar log, mapear, ver grafo',
    'CRUD da Análise de desvios: gerar, ver, renomear, excluir',
    'Painel via GET /aggregated-data',
  ] },
  { area: 'qr', tone: 'req', title: 'Requisitos de qualidade', original: 'Quality Requirements', items: [
    'Correção: 0, 4, 7 e 9 desvios',
    'Tolerância a falhas',
    'Modificabilidade',
    'Implantabilidade',
  ] },
  { area: 'cd', tone: 'sol', title: 'Decisões principais', original: 'Core Decisions', items: [
    'Um serviço por dono do dado',
    'ADWIN em Function disparada por fila',
    'API Gateway no Azure API Management',
    'Contêineres no Fly.io (São Paulo)',
    'Exclusão em cascata por evento',
    'Sem login: chave e limite no gateway',
  ] },
  { area: 'tech', tone: 'sol', title: 'Tecnologias', original: 'Technologies', items: [
    'React 19 + Vite · Vercel',
    'Node.js 22 + NestJS',
    'Python 3.12 + FastAPI + PM4Py',
    'Azure Functions + river',
    'API Management + Service Bus',
    'MongoDB Atlas · Azure SQL',
    'Docker Hub · GitHub Actions · Fly.io',
  ] },
  { area: 'bc', tone: 'req', title: 'Contexto de negócio', original: 'Business Context', items: [
    'Analista usa o Driftor pelo navegador',
    'Sistema da fábrica exporta o event log (XES ou CSV)',
    'Pesquisa IPDD fornece o método e as bases de referência',
  ] },
  { area: 'comp', tone: 'sol', title: 'Componentes', original: 'Components / Modules', items: [
    'Microfrontend → API Gateway → BFF',
    'pmining + MongoDB Atlas (processos, traces, atividades)',
    'ipdd + Azure SQL (análises, desvios, série)',
    'fn-adwin, sem estado',
    'Service Bus: 3 filas de eventos',
  ] },
  { area: 'risk', tone: 'risk', title: 'Riscos e informações faltantes', original: 'Risks and Missing Information', items: [
    'Cold start deixa a primeira tela lenta',
    'Cota gratuita do Azure SQL pode acabar no mês',
    'Serviços no Fly.io também respondem fora do gateway',
    'Mensagem que sempre falha trava a análise em andamento',
    'Fora desta versão: login e previsão de falha',
  ] },
]

const PRINTS = [
  { label: 'Frontend funcionando', note: 'Microfrontend na Vercel', href: 'https://driftor-asc-mfe.vercel.app' },
  { label: 'Swagger do BFF', note: 'Inclui o GET /aggregated-data', href: 'https://driftor-asc-bff.fly.dev/docs' },
  { label: 'Swagger do pmining', note: 'Microsserviço 1, MongoDB Atlas', href: 'https://driftor-asc-pmining.fly.dev/docs' },
  { label: 'Swagger do ipdd', note: 'Microsserviço 2, Azure SQL', href: 'https://driftor-asc-ipdd.fly.dev/docs' },
  { label: 'API Gateway', note: 'Sem a chave de assinatura responde 401; o print sai do portal da Azure (API Management)', href: 'https://driftor-asc-apim.azure-api.net/api' },
]

const LINKS = [
  { label: 'Eventos (AsyncAPI)', href: 'https://driftor-asc-ipdd.fly.dev/events' },
  { label: 'Function (saúde)', href: 'https://driftor-asc-fn-adwin-dsa6htarh3avfag4.brazilsouth-01.azurewebsites.net/api/health' },
  { label: 'Imagens no Docker Hub', href: 'https://hub.docker.com/u/aland3r' },
  ...['mfe', 'bff', 'pmining', 'ipdd', 'fn-adwin'].map((r) => ({ label: `Repositório driftor-asc-${r}`, href: `https://github.com/aland3r/driftor-asc-${r}` })),
]

const SHEET_W = 1200

function CanvasSheet() {
  return (
      <div className="acc-sheet">
        <header className="acc-head">
          <p className="acc-brand">arc<sup>42</sup></p>
          <h3 className="acc-title">Architecture Communication Canvas</h3>
          <dl className="acc-meta">
            {META.map((m) => <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>)}
          </dl>
        </header>
        <div className="acc">
          {CANVAS.map((b) => {
            const Icon = ICON[b.area]
            return (
              <section key={b.area} className={`acc-block acc-${b.tone}`} style={{ gridArea: b.area }}>
                <div className="acc-block-head">
                  <h4>{b.title}<span>{b.original}</span></h4>
                  <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
                </div>
                <ul>{b.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </section>
            )
          })}
        </div>
        <footer className="acc-foot">
          <p className="acc-legend">
            {(Object.keys(TONE_LABEL) as Tone[]).map((t) => <span key={t} className={`acc-key acc-${t}`}>{TONE_LABEL[t]}</span>)}
          </p>
          <p className="acc-credit">Software Architecture Canvas, © 2023 Gernot Starke, Patrick Roos e arc42 Contributors, CC BY-SA 4.0 · canvas.arc42.org</p>
        </footer>
      </div>
  )
}

/**
 * O canvas é desenhado uma vez fora da tela, na largura de uma folha, e vira um SVG
 * (foreignObject): na página aparece reduzido e no clique abre na janela de zoom dos diagramas.
 */
function CanvasPreview() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [markup, setMarkup] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    document.fonts.ready.then(() => {
      const sheet = hostRef.current?.firstElementChild as HTMLElement | null
      if (!alive || !sheet) return
      const h = Math.ceil(sheet.offsetHeight)
      setMarkup(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${h}" width="100%" role="img" aria-label="Architecture Communication Canvas do Driftor ASC"><foreignObject x="0" y="0" width="${SHEET_W}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml">${sheet.outerHTML}</div></foreignObject></svg>`)
    })
    return () => { alive = false }
  }, [])

  return (
    <>
      <div ref={hostRef} className="acc-measure" aria-hidden="true"><CanvasSheet /></div>
      {markup && (
        <figure className="diagram acc-preview">
          <div
            role="button"
            tabIndex={0}
            aria-label="Ampliar o canvas"
            className="diagram-box"
            onClick={() => setOpen(true)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(true)}
            dangerouslySetInnerHTML={{ __html: markup }}
          />
          <figcaption><Maximize2 size={12} aria-hidden="true" />Clique no canvas para ampliar</figcaption>
        </figure>
      )}
      {open && markup && <DiagramZoom markup={markup} onClose={() => setOpen(false)} />}
    </>
  )
}

const TONE_LABEL: Record<Tone, string> = { req: 'Requisitos: o que o sistema faz', sol: 'Solução: como funciona', risk: 'Problemas e riscos conhecidos' }

export function ArtifactsPanel({ sections, onOpen }: { sections: Arc42Section[]; onOpen: (section: string, sub: string) => void }) {
  // Os três níveis são desenhados de antemão, um por vez, para o zoom abrir na hora do clique.
  const [markups, setMarkups] = useState<Record<string, string>>({})
  const [zoom, setZoom] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const c of C4) {
        const code = diagramOf(sections, c.section, c.sub)
        if (!code) continue
        try {
          const markup = await mermaidMarkup(code, `c4${c.sub.replace('.', '')}`)
          if (alive) setMarkups((m) => ({ ...m, [c.title]: markup }))
        } catch { /* sem diagrama, o cartão leva à seção */ }
      }
    })()
    return () => { alive = false }
  }, [sections])

  return (
    <>
      <h2 className="doc-h2" data-anchor="c4">C4 Model</h2>
      <p>Os três níveis do C4 estão nas seções do arc42, em Mermaid. Cada cartão abre o diagrama ampliado.</p>
      <div className="c4-cards">
        {C4.map((c) => (
          <button key={c.title} type="button" className="c4-card" onClick={() => (markups[c.title] ? setZoom(c.title) : onOpen(c.section, c.sub))}>
            <span className="label">{c.level}</span>
            <span className="c4-title">{c.title}</span>
            <span className="c4-where">{c.where}{markups[c.title] ? <Maximize2 size={13} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</span>
          </button>
        ))}
      </div>
      {zoom && markups[zoom] && <DiagramZoom markup={markups[zoom]} onClose={() => setZoom(null)} />}

      <h2 className="doc-h2" data-anchor="canvas">Canvas</h2>
      <p>
        Architecture Communication Canvas do Driftor ASC: a arquitetura inteira em uma página, no modelo do{' '}
        <a href="https://canvas.arc42.org/architecture-communication-canvas" target="_blank" rel="noreferrer">arc42 Canvas</a>.
      </p>
      <CanvasPreview />

      <h2 className="doc-h2" data-anchor="prints">Prints e links</h2>
      <p>Os quatro prints pedidos na entrega saem destes endereços, todos na nuvem.</p>
      <div className="doc-table">
        <table>
          <thead><tr><th>Print</th><th>Endereço</th></tr></thead>
          <tbody>
            {PRINTS.map((p) => (
              <tr key={p.label}>
                <td><strong>{p.label}</strong><br /><span className="acc-note">{p.note}</span></td>
                <td><a href={p.href} target="_blank" rel="noreferrer" className="ext-link">{p.href.replace('https://', '')}<ArrowUpRight size={12} aria-hidden="true" /></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="doc-h3">Outros links da entrega</h3>
      <ul className="link-list">
        {LINKS.map((l) => (
          <li key={l.href}><a href={l.href} target="_blank" rel="noreferrer" className="ext-link">{l.label}<ArrowUpRight size={12} aria-hidden="true" /></a></li>
        ))}
      </ul>
    </>
  )
}
