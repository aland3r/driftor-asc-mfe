import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api/client'
import { AppHeader } from '../components/AppHeader'
import { ARTIFACT_SUBS, ArtifactsPanel } from '../features/docs/Artifacts'
import { Mermaid } from '../features/docs/Mermaid'
import { SECTION_BLURBS, parseArc42, type Arc42Section } from '../features/docs/arc42'
import './docs.css'

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: ReactNode } }).props.children)
  return ''
}

const MD: Components = {
  h3: ({ children }) => <h2 className="doc-h2" data-anchor={/^(\d+\.\d+)/.exec(textOf(children))?.[1]}>{children}</h2>,
  h4: ({ children }) => <h3 className="doc-h3">{children}</h3>,
  a: ({ children, href }) => <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{children}</a>,
  blockquote: ({ children }) => <aside className="doc-callout">{children}</aside>,
  table: ({ children }) => <div className="doc-table"><table>{children}</table></div>,
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? '')?.[1]
    const raw = String(children).replace(/\n$/, '')
    if (lang === 'mermaid') return <Mermaid code={raw} />
    if (lang) return <code className="doc-code-block">{children}</code>
    return <code className="doc-code">{children}</code>
  },
  pre: ({ children }) => {
    const child = (Array.isArray(children) ? children[0] : children) as { props?: { className?: string } }
    if (/language-mermaid/.test(child?.props?.className ?? '')) return <>{children}</>
    return <pre className="doc-pre">{children}</pre>
  },
  hr: () => null,
  img: ({ src, alt }) => <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} className="doc-img" />,
}

const ARTIFACTS = 'artefatos'

/** Documentação: o arc42 do projeto servido pelo BFF, com índice das seções e "Nesta página". */
export function DocsPage() {
  const [markdown, setMarkdown] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [active, setActive] = useState(() => {
    if (typeof location === 'undefined') return '1'
    if (location.hash === `#${ARTIFACTS}`) return ARTIFACTS
    return /^#s\d+$/.test(location.hash) ? location.hash.slice(2) : '1'
  })
  const [pendingSub, setPendingSub] = useState<string | null>(null)
  const [activeSub, setActiveSub] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    api.documentation().then((t) => { if (alive) { setMarkdown(t); setStatus('ready') } }).catch(() => alive && setStatus('error'))
    return () => { alive = false }
  }, [])

  const { intro, sections } = useMemo(() => parseArc42(markdown), [markdown])
  const isArtifacts = active === ARTIFACTS
  const section = isArtifacts ? undefined : sections.find((s) => s.id === active) ?? sections[0]
  const subs = isArtifacts ? ARTIFACT_SUBS : section?.sub ?? []
  const index = section ? sections.indexOf(section) : -1
  const prev = index > 0 ? sections[index - 1] : null
  const next = index >= 0 && index < sections.length - 1 ? sections[index + 1] : null

  useEffect(() => { setActiveSub(subs[0]?.id ?? null) }, [section, isArtifacts])

  // Atalho vindo dos artefatos: abre a seção e rola até a subseção depois que os diagramas desenham.
  useEffect(() => {
    if (!pendingSub || status !== 'ready') return
    const scroll = () => contentRef.current?.querySelector(`[data-anchor="${pendingSub}"]`)?.scrollIntoView({ block: 'start' })
    const timers = [50, 600, 1500].map((ms) => setTimeout(scroll, ms))
    const done = setTimeout(() => setPendingSub(null), 1600)
    return () => { timers.forEach(clearTimeout); clearTimeout(done) }
  }, [pendingSub, active, status])

  function go(id: string, sub?: string) {
    setActive(id)
    history.replaceState(null, '', id === ARTIFACTS ? `#${ARTIFACTS}` : `#s${id}`)
    if (contentRef.current) contentRef.current.scrollTop = 0
    setPendingSub(sub ?? null)
  }

  function onScroll() {
    const root = contentRef.current
    if (!root || !subs.length) return
    const limit = root.getBoundingClientRect().top + root.clientHeight / 3
    let current = subs[0].id
    root.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => { if (el.getBoundingClientRect().top <= limit) current = el.dataset.anchor ?? current })
    setActiveSub(current)
  }

  function toSub(id: string) {
    setActiveSub(id)
    contentRef.current?.querySelector(`[data-anchor="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page">
      <AppHeader context={<span className="crumb">Arquitetura · arc42</span>} />
      <div className="page-body">
        <nav className="doc-nav" aria-label="Seções do arc42">
          {sections.map((s) => (
            <button key={s.id} type="button" className={s.id === section?.id ? 'active' : ''} aria-current={s.id === section?.id ? 'page' : undefined} onClick={() => go(s.id)}>
              <span className="mono">{s.num}</span>{s.title}
            </button>
          ))}
          {sections.length > 0 && (
            <button type="button" className={`doc-nav-extra ${isArtifacts ? 'active' : ''}`} aria-current={isArtifacts ? 'page' : undefined} onClick={() => go(ARTIFACTS)}>
              <span className="mono">+</span>Artefatos obrigatórios
            </button>
          )}
        </nav>
        <div ref={contentRef} onScroll={onScroll} className="doc-scroll">
          <div className={isArtifacts ? 'doc-layout is-wide' : 'doc-layout'}>
            <article className="doc">
              {status === 'loading' && <p className="doc-status"><Loader2 size={14} className="spin" />Carregando a documentação…</p>}
              {status === 'error' && <p className="doc-status error-text">Não foi possível carregar a documentação agora. Tente de novo em instantes.</p>}
              {status === 'ready' && section && (
                <>
                  <p className="doc-kicker mono">{section.num} / {String(sections.length).padStart(2, '0')}</p>
                  <h1>{section.title}</h1>
                  {section.id === '1' && intro && (
                    <aside className="doc-callout">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{intro}</ReactMarkdown>
                    </aside>
                  )}
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{section.body}</ReactMarkdown>
                  {section.id === sections[sections.length - 1]?.id && (
                    <nav className="doc-pager" aria-label="Navegação entre seções">
                      {prev && <Pager section={prev} dir="prev" onClick={() => go(prev.id)} />}
                      <button type="button" className="pager pager-next" onClick={() => go(ARTIFACTS)}>
                        <span className="pager-dir">Próxima</span>
                        <span className="pager-title"><span className="mono">+</span>Artefatos obrigatórios</span>
                        <span className="pager-blurb">C4, canvas e links para os prints</span>
                      </button>
                    </nav>
                  )}
                  {section.id !== sections[sections.length - 1]?.id && (prev || next) && (
                    <nav className="doc-pager" aria-label="Navegação entre seções">
                      {prev && <Pager section={prev} dir="prev" onClick={() => go(prev.id)} />}
                      {next && <Pager section={next} dir="next" onClick={() => go(next.id)} />}
                    </nav>
                  )}
                </>
              )}
              {status === 'ready' && isArtifacts && (
                <>
                  <p className="doc-kicker mono">Anexo</p>
                  <h1>Artefatos obrigatórios</h1>
                  <ArtifactsPanel sections={sections} onOpen={(id, sub) => go(id, sub)} />
                  {sections.length > 0 && (
                    <nav className="doc-pager" aria-label="Navegação entre seções">
                      <Pager section={sections[sections.length - 1]} dir="prev" onClick={() => go(sections[sections.length - 1].id)} />
                    </nav>
                  )}
                </>
              )}
            </article>
            <div className="doc-toc">
              {subs.length > 0 && (
                <>
                  <p className="doc-toc-title">Nesta página</p>
                  {subs.map((s) => (
                    <button key={s.id} type="button" className={activeSub === s.id ? 'active' : ''} onClick={() => toSub(s.id)}>{s.title}</button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Pager({ section, dir, onClick }: { section: Arc42Section; dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button type="button" className={`pager pager-${dir}`} onClick={onClick}>
      <span className="pager-dir">{dir === 'next' ? 'Próxima' : 'Anterior'}</span>
      <span className="pager-title"><span className="mono">{section.num}</span>{section.title}</span>
      {SECTION_BLURBS[section.id] && <span className="pager-blurb">{SECTION_BLURBS[section.id]}</span>}
    </button>
  )
}
