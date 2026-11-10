import { Link } from 'react-router-dom'
import { ArrowRight, Github, Youtube } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import './landing.css'

const OWNER = 'https://github.com/aland3r'
const REPOS = [
  { name: 'driftor-asc-mfe', role: 'Microfrontend React desta interface' },
  { name: 'driftor-asc-bff', role: 'BFF em Node: agrega os serviços em /aggregated-data' },
  { name: 'driftor-asc-pmining', role: 'Processos: upload, mapeamento e grafo, no MongoDB Atlas' },
  { name: 'driftor-asc-ipdd', role: 'Análises de desvio e seus resultados, no Azure SQL' },
  { name: 'driftor-asc-fn-adwin', role: 'Azure Function com o ADWIN, acionada pela fila' },
]
const VIDEO_URL = import.meta.env.VITE_VIDEO_URL as string | undefined

export function LandingPage() {
  return (
    <div className="page">
      <AppHeader actions={<Link to="/app" className="btn btn-sm btn-primary">Começar a usar<ArrowRight size={14} /></Link>} />
      <div className="landing-scroll">
        <main className="landing">
          <section className="hero">
            <div className="hero-text">
              <h1>Veja quando o seu processo mudou de ritmo.</h1>
              <p>
                O Driftor lê o log de eventos da produção, desenha o processo como um grafo e procura, na série de durações,
                o ponto em que o desempenho mudou de patamar. Cada desvio vem com o trace onde começou e a variação antes e depois.
              </p>
              <div className="hero-cta">
                <Link to="/app" className="btn btn-primary btn-lg">Começar a usar<ArrowRight size={16} /></Link>
                <Link to="/documentacao" className="btn btn-lg">Ler a arquitetura</Link>
              </div>
            </div>
            <HeroArt />
          </section>

          <section className="steps" aria-label="Como funciona">
            <div><span className="mono">1</span><h2>Envie o log</h2><p>Arquivo .xes ou .csv. Cada evento é ligado a uma atividade do processo.</p></div>
            <div><span className="mono">2</span><h2>Explore o grafo</h2><p>Atividades e caminhos com frequência e duração, filtrados por densidade.</p></div>
            <div><span className="mono">3</span><h2>Gere a análise</h2><p>O ADWIN roda em uma Azure Function e marca cada desvio de desempenho.</p></div>
          </section>

          <section className="delivery" aria-labelledby="delivery-title">
            <h2 id="delivery-title">Código e apresentação</h2>
            <ul className="delivery-list">
              {REPOS.map((r) => (
                <li key={r.name}>
                  <a href={`${OWNER}/${r.name}`} target="_blank" rel="noreferrer">
                    <Github size={16} aria-hidden="true" />
                    <span className="mono">{r.name}</span>
                    <span className="delivery-role">{r.role}</span>
                  </a>
                </li>
              ))}
              <li>
                {VIDEO_URL ? (
                  <a href={VIDEO_URL} target="_blank" rel="noreferrer">
                    <Youtube size={16} aria-hidden="true" />
                    <span>Vídeo da apresentação</span>
                    <span className="delivery-role">Arquitetura e demonstração, no YouTube</span>
                  </a>
                ) : (
                  <span className="delivery-pending">
                    <Youtube size={16} aria-hidden="true" />
                    <span>Vídeo da apresentação</span>
                    <span className="delivery-role">Publicado junto com a entrega</span>
                  </span>
                )}
              </li>
            </ul>
          </section>
        </main>
        <footer className="landing-foot">
          <p>Alander Menezes Arantes de Ávila · Bernardo Creplive Vieira · Emanuelle Skolut Jose · Murilo Regnier Stange</p>
          <p>Projeto acadêmico, PUCPR, 2026. Dados sintéticos de manufatura.</p>
        </footer>
      </div>
    </div>
  )
}

function HeroArt() {
  const pts = [62, 60, 64, 61, 63, 59, 62, 60, 61, 63, 60, 62, 44, 41, 43, 40, 42, 44, 41, 43, 40, 42, 41, 43, 42, 40]
  const x = (i: number) => 24 + i * 16
  const y = (v: number) => 180 - v * 2
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  return (
    <svg className="hero-art" viewBox="0 0 440 260" role="img" aria-label="Série de durações com um desvio marcado: o patamar cai depois do décimo segundo trace">
      {[60, 100, 140, 180].map((g) => <line key={g} x1="24" x2="424" y1={g} y2={g} stroke="rgba(255,255,255,0.05)" />)}
      <rect x={x(11.5)} y="40" width={x(14) - x(11.5)} height="160" fill="rgba(220,38,38,0.08)" />
      <line x1={x(12)} x2={x(12)} y1="36" y2="204" stroke="#dc2626" strokeDasharray="5 3" />
      <text x={x(12) + 6} y="50" fontSize="12" fontFamily="JetBrains Mono, monospace" fill="#fca5a5">D1</text>
      <path d={`M24,${y(61.5)} H${x(11.5)}`} stroke="rgba(200,226,245,0.35)" strokeDasharray="2 4" />
      <path d={`M${x(12)},${y(42)} H424`} stroke="rgba(200,226,245,0.35)" strokeDasharray="2 4" />
      <path d={line} fill="none" stroke="#4d8fc0" strokeWidth="2.2" strokeLinejoin="round" />
      {pts.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === 12 ? 4.5 : 2.4} fill={i === 12 ? '#f59e0b' : '#c8e2f5'} />)}
      <line x1="24" x2="424" y1="214" y2="214" stroke="rgba(255,255,255,0.12)" />
      <text x="24" y="238" fontSize="12" fontFamily="JetBrains Mono, monospace" fill="#91a0b5">CASE-0001</text>
      <text x="424" y="238" textAnchor="end" fontSize="12" fontFamily="JetBrains Mono, monospace" fill="#91a0b5">CASE-0026</text>
      <text x="300" y="132" fontSize="12" fontFamily="JetBrains Mono, monospace" fill="#c8dff0">−32 %</text>
    </svg>
  )
}
