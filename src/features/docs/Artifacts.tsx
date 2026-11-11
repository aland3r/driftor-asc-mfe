import { ArrowUpRight, ChevronRight } from 'lucide-react'

/*
  Artefatos obrigatórios da entrega: atalhos para o C4 dentro do arc42,
  o Architecture Communication Canvas do Driftor e os links que viram prints.
*/

export const ARTIFACT_SUBS = [
  { id: 'c4', title: 'C4 Model' },
  { id: 'canvas', title: 'Canvas' },
  { id: 'prints', title: 'Prints e links' },
]

const C4 = [
  { level: 'Nível 1', title: 'Contexto', where: '3.1 Contexto de negócio', section: '3', sub: '3.1' },
  { level: 'Nível 2', title: 'Containers', where: '5.1 Containers', section: '5', sub: '5.1' },
  { level: 'Nível 3', title: 'Componentes', where: '5.2 Componentes do ipdd', section: '5', sub: '5.2' },
]

type Tone = 'req' | 'sol' | 'risk'
interface Block { area: string; tone: Tone; title: string; original: string; items: string[] }

const CANVAS: Block[] = [
  { area: 'vp', tone: 'req', title: 'Proposta de valor', original: 'Value Proposition', items: [
    'Mostrar quando um processo produtivo mudou de ritmo, a partir do event log que a fábrica já exporta.',
    'Aplica o detector ADWIN do método IPDD com os mesmos resultados publicados na pesquisa.',
  ] },
  { area: 'ks', tone: 'req', title: 'Stakeholders', original: 'Key Stakeholders', items: [
    'Analista de processo, o usuário.',
    'Autora do framework IPDD.',
    'Professor de Arquitetura e Soluções Cloud.',
    'Grupo de desenvolvimento.',
  ] },
  { area: 'cf', tone: 'req', title: 'Funções principais', original: 'Core Functions', items: [
    'CRUD do Processo: criar pelo nome, carregar o log XES ou CSV, mapear as operações, ver grafo e variantes.',
    'CRUD da Análise de desvios: gerar, ver série e desvios, renomear, excluir.',
    'Painel e GET /aggregated-data no BFF.',
  ] },
  { area: 'qr', tone: 'req', title: 'Requisitos de qualidade', original: 'Quality Requirements', items: [
    'Correção analítica: 0, 4, 7 e 9 desvios nas bases do artigo.',
    'Tolerância a falhas: resposta parcial se uma fonte cair.',
    'Modificabilidade: só o pmining conhece o log.',
    'Implantabilidade: uma imagem e um deploy por serviço.',
  ] },
  { area: 'cd', tone: 'sol', title: 'Decisões principais', original: 'Core Decisions', items: [
    'Dividir por dono do dado: pmining lê o log, ipdd guarda as análises, a Function só calcula.',
    'ADWIN numa Azure Function disparada por fila, para o cálculo não prender a tela.',
    'API Gateway no Azure API Management, na mesma assinatura dos outros recursos.',
    'Contêineres no Fly.io, em São Paulo, a partir das imagens do Docker Hub.',
    'Exclusão em cascata por evento (process-deleted).',
    'Sem login nesta versão: acesso pela chave e pelo limite do gateway.',
  ] },
  { area: 'tech', tone: 'sol', title: 'Tecnologias', original: 'Technologies', items: [
    'React 19 e Vite na Vercel.',
    'Node.js 22 e NestJS (BFF e ipdd).',
    'Python 3.12, FastAPI e PM4Py (pmining).',
    'Azure Functions Python com river (ADWIN).',
    'Azure API Management e Service Bus.',
    'MongoDB Atlas e Azure SQL.',
    'Docker Hub, GitHub Actions e Fly.io.',
  ] },
  { area: 'bc', tone: 'req', title: 'Contexto de negócio', original: 'Business Context', items: [
    'O analista usa o Driftor pelo navegador.',
    'O sistema da fábrica exporta o event log que o analista carrega.',
    'A pesquisa IPDD fornece o método e as bases de referência.',
  ] },
  { area: 'comp', tone: 'sol', title: 'Componentes', original: 'Components / Modules', items: [
    'Microfrontend, API Gateway e BFF.',
    'pmining com MongoDB Atlas: processos, traces e atividades.',
    'ipdd com Azure SQL: análises, desvios e pontos da série.',
    'fn-adwin: cálculo do ADWIN, sem estado.',
    'Service Bus: analysis-requested, analysis-completed e process-deleted.',
  ] },
  { area: 'risk', tone: 'risk', title: 'Riscos e informações faltantes', original: 'Risks and Missing Information', items: [
    'Cold start do Fly.io, da Function e do Azure SQL serverless deixa a primeira tela lenta.',
    'A cota gratuita do Azure SQL pode acabar no mês.',
    'Os serviços no Fly.io também respondem fora do gateway.',
    'Uma mensagem que sempre falha deixa a análise em andamento.',
    'Fora desta versão: login de usuário e previsão de falha.',
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

const TONE_LABEL: Record<Tone, string> = { req: 'Requisitos: o que o sistema faz', sol: 'Solução: como funciona', risk: 'Problemas e riscos conhecidos' }

export function ArtifactsPanel({ onOpen }: { onOpen: (section: string, sub: string) => void }) {
  return (
    <>
      <h2 className="doc-h2" data-anchor="c4">C4 Model</h2>
      <p>Os três níveis do C4 estão nas seções do arc42, em Mermaid. Cada cartão abre o diagrama.</p>
      <div className="c4-cards">
        {C4.map((c) => (
          <button key={c.title} type="button" className="c4-card" onClick={() => onOpen(c.section, c.sub)}>
            <span className="label">{c.level}</span>
            <span className="c4-title">{c.title}</span>
            <span className="c4-where">{c.where}<ChevronRight size={14} aria-hidden="true" /></span>
          </button>
        ))}
      </div>

      <h2 className="doc-h2" data-anchor="canvas">Canvas</h2>
      <p>
        Architecture Communication Canvas do Driftor ASC: a arquitetura inteira em uma página, no modelo do{' '}
        <a href="https://canvas.arc42.org/architecture-communication-canvas" target="_blank" rel="noreferrer">arc42 Canvas</a>.
      </p>
      <div className="acc">
        {CANVAS.map((b) => (
          <section key={b.area} className={`acc-block acc-${b.tone}`} style={{ gridArea: b.area }}>
            <h3>{b.title}<span>{b.original}</span></h3>
            <ul>{b.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </section>
        ))}
      </div>
      <p className="acc-legend">
        {(Object.keys(TONE_LABEL) as Tone[]).map((t) => <span key={t} className={`acc-key acc-${t}`}>{TONE_LABEL[t]}</span>)}
      </p>
      <p className="acc-credit">Modelo: Architecture Communication Canvas (canvas.arc42.org), licença CC BY-SA 4.0.</p>

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
