import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { LandingPage } from './pages/LandingPage'
import { DashboardPage } from './pages/DashboardPage'

// Grafo, gráfico e Mermaid são pesados: cada tela carrega só o que usa.
const ProcessPage = lazy(() => import('./pages/ProcessPage').then((m) => ({ default: m.ProcessPage })))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then((m) => ({ default: m.AnalysisPage })))
const DocsPage = lazy(() => import('./pages/DocsPage').then((m) => ({ default: m.DocsPage })))

export function App() {
  return (
    <Suspense fallback={<div className="loading" style={{ height: '100%' }}><Loader2 size={16} className="spin" />Carregando…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/processos/:id" element={<ProcessPage />} />
        <Route path="/analises/:id" element={<AnalysisPage />} />
        <Route path="/documentacao" element={<DocsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
