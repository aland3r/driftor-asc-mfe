import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minus, Plus, ScanSearch, X } from 'lucide-react'

/**
 * Diagramas Mermaid do arc42, renderizados no tema escuro. O SVG é recortado
 * ao conteúdo desenhado e pode ser ampliado em tela cheia.
 */
type MermaidApi = typeof import('mermaid')['default']
let loader: Promise<MermaidApi> | null = null
function getMermaid() {
  loader ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', fontFamily: 'Inter, system-ui, sans-serif' })
    return m.default
  })
  return loader
}

const PAD = 12
const MAX_ZOOM = 1.8
const LAYOUT_WIDTH = 1200
const CLASS_LAYOUT_WIDTH = 2200

// O layout do C4 quebra linhas em screen.availWidth; no celular vira uma coluna só.
let widened = 0
function widenScreen(code: string) {
  const want = /\bclassDiagram\b/.test(code) ? CLASS_LAYOUT_WIDTH : LAYOUT_WIDTH
  if (widened++ === 0 && window.screen.availWidth < want) {
    Object.defineProperty(window.screen, 'availWidth', { value: want, configurable: true })
  }
}
function restoreScreen() {
  if (--widened === 0) delete (window.screen as unknown as Record<string, unknown>).availWidth
}

// O C4 do Mermaid desenha relações em #444444, invisível no fundo escuro.
function lightenC4Lines(svg: string) {
  return svg.includes('aria-roledescription="c4"') ? svg.replace(/"#444444"/g, '"#cbd5e1"') : svg
}

function cropSvg(svg: SVGSVGElement) {
  svg.querySelectorAll('rect[style*="fill:transparent"]').forEach((r) => r.closest('g')?.setAttribute('display', 'none'))
  const box = svg.getBBox()
  if (!box.width || !box.height) return
  svg.setAttribute('viewBox', `${box.x - PAD} ${box.y - PAD} ${box.width + 2 * PAD} ${box.height + 2 * PAD}`)
  svg.removeAttribute('height')
  svg.setAttribute('width', '100%')
  svg.style.maxWidth = `${Math.round((box.width + 2 * PAD) * MAX_ZOOM)}px`
  svg.style.height = 'auto'
}

const INHERIT_STEM = 56
const TIP_STUB_MAX = 8
type P = { x: number; y: number }
const pathPoints = (d: string): P[] => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }))
function setOrthoPath(path: SVGPathElement, points: P[]) {
  if (points.length < 2) return
  path.setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(''))
  path.style.strokeDasharray = ''
  path.style.strokeDashoffset = ''
}
const markerOf = (path: SVGPathElement) => { const s = getComputedStyle(path); return `${s.markerStart || ''} ${s.markerEnd || ''}` }

// Herança em diagrama de classes: haste reta saindo do triângulo.
function straightenInheritanceStems(svg: SVGSVGElement) {
  svg.querySelectorAll<SVGPathElement>('path.relation').forEach((path) => {
    if (!/extension/i.test(markerOf(path))) return
    const pts = pathPoints(path.getAttribute('d') ?? '')
    if (pts.length < 2) return
    const start = pts[0]
    const end = pts[pts.length - 1]
    const dx = end.x - start.x
    const dy = end.y - start.y
    if (Math.abs(dx) < 1.5) return setOrthoPath(path, [start, { x: start.x, y: end.y }])
    if (Math.abs(dy) < 1.5) return setOrthoPath(path, [start, { x: end.x, y: start.y }])
    if (Math.abs(dy) >= Math.abs(dx) * 0.55) {
      const dir = Math.sign(dy) || 1
      const stem = Math.min(INHERIT_STEM, Math.max(28, Math.abs(dy) * 0.4))
      if (Math.abs(dy) < stem + 12) return
      const y = start.y + dir * stem
      if ((dir > 0 && y >= end.y - 6) || (dir < 0 && y <= end.y + 6)) return
      return setOrthoPath(path, [start, { x: start.x, y }, { x: end.x, y }, end])
    }
    const dir = Math.sign(dx) || 1
    const stem = Math.min(INHERIT_STEM, Math.max(28, Math.abs(dx) * 0.35))
    if (Math.abs(dx) < stem + 12) return
    const x = start.x + dir * stem
    if ((dir > 0 && x >= end.x - 6) || (dir < 0 && x <= end.x + 6)) return
    setOrthoPath(path, [start, { x, y: start.y }, { x, y: end.y }, end])
  })
}

function unkinkRelationTips(svg: SVGSVGElement) {
  svg.querySelectorAll<SVGPathElement>('path.relation').forEach((path) => {
    if (/extension/i.test(markerOf(path))) return
    const pts = pathPoints(path.getAttribute('d') ?? '')
    if (pts.length < 3) return
    const b = pts[pts.length - 2]
    const c = pts[pts.length - 1]
    if (Math.hypot(c.x - b.x, c.y - b.y) < TIP_STUB_MAX) setOrthoPath(path, [...pts.slice(0, -2), c])
  })
}

/** Desenha o diagrama fora da tela e devolve o SVG já tratado, para abrir direto no zoom. */
export async function mermaidMarkup(code: string, key: string): Promise<string> {
  widenScreen(code)
  try {
    const m = await getMermaid()
    const { svg } = await m.render(`mmz-${key}`, code)
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;visibility:hidden'
    host.innerHTML = lightenC4Lines(svg)
    document.body.appendChild(host)
    try {
      const el = host.querySelector('svg')
      if (!el) throw new Error('Diagrama vazio')
      straightenInheritanceStems(el)
      unkinkRelationTips(el)
      cropSvg(el)
      return el.outerHTML
    } finally { host.remove() }
  } finally { restoreScreen() }
}

/** Abre um SVG já pronto na mesma janela de zoom dos diagramas do arc42. */
export function DiagramZoom({ markup, onClose }: { markup: string; onClose: () => void }) {
  return createPortal(<ZoomOverlay markup={markup} onClose={onClose} />, document.body)
}

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [markup, setMarkup] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    widenScreen(code)
    getMermaid()
      .then((m) => m.render(`mmd-${id}`, code))
      .then(({ svg }) => {
        if (cancelled || !ref.current) return
        ref.current.innerHTML = lightenC4Lines(svg)
        const el = ref.current.querySelector('svg')
        if (el) {
          straightenInheritanceStems(el)
          unkinkRelationTips(el)
          cropSvg(el)
          setMarkup(el.outerHTML)
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)) })
      .finally(restoreScreen)
    return () => { cancelled = true }
  }, [code, id])

  if (error) return <pre className="doc-pre">{error}</pre>
  return (
    <>
      <figure className="diagram">
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          aria-label="Ampliar diagrama"
          className="diagram-box"
          onClick={() => markup && setOpen(true)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && markup && setOpen(true)}
        />
        {markup && <figcaption><Maximize2 size={12} aria-hidden="true" />Clique no diagrama para ampliar</figcaption>}
      </figure>
      {open && markup && createPortal(<ZoomOverlay markup={markup} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

const MIN_SCALE = 0.25
const MAX_SCALE = 6
const STEP = 1.25
function naturalSize(markup: string) {
  const m = markup.match(/viewBox="([-\d.\s]+)"/)
  if (!m) return { width: 1000, height: 1000 }
  const [, , width, height] = m[1].trim().split(/\s+/).map(Number)
  return { width, height }
}

function ZoomOverlay({ markup, onClose }: { markup: string; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const size = naturalSize(markup)
  const [scale, setScale] = useState<number | null>(null)
  const fitWidth = () => {
    const el = scrollRef.current
    if (el) setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, (el.clientWidth - 32) / size.width)))
  }
  const zoom = (f: number) => setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, (s ?? 1) * f)))

  useEffect(() => {
    fitWidth()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoom(STEP)
      else if (e.key === '-') zoom(1 / STEP)
      else if (e.key === '0') fitWidth()
    }
    window.addEventListener('keydown', onKey)
    const el = scrollRef.current
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom(e.deltaY < 0 ? STEP : 1 / STEP) }
    el?.addEventListener('wheel', onWheel, { passive: false })
    return () => { window.removeEventListener('keydown', onKey); el?.removeEventListener('wheel', onWheel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div role="dialog" aria-modal="true" aria-label="Diagrama ampliado" className="zoom-overlay">
      <div className="zoom-bar">
        <span>{scale ? `${Math.round(scale * 100)}%` : ''} · Ctrl + rolagem para zoom</span>
        <button type="button" className="btn btn-icon" aria-label="Diminuir zoom" onClick={() => zoom(1 / STEP)}><Minus size={16} /></button>
        <button type="button" className="btn btn-icon" aria-label="Ajustar à largura" onClick={fitWidth}><ScanSearch size={16} /></button>
        <button type="button" className="btn btn-icon" aria-label="Aumentar zoom" onClick={() => zoom(STEP)}><Plus size={16} /></button>
        <button type="button" className="btn btn-icon" aria-label="Fechar" onClick={onClose}><X size={16} /></button>
      </div>
      <div ref={scrollRef} className="zoom-scroll">
        <div
          className="zoom-canvas"
          style={scale ? { width: size.width * scale + 32, height: size.height * scale + 32 } : { visibility: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </div>
    </div>
  )
}
