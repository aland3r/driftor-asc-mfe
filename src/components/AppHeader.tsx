import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Logo } from './Logo'
import './header.css'

/**
 * Cabeçalho único de todas as telas: marca sempre no mesmo lugar, navegação
 * principal, contexto da página (migalha e título) e ações à direita.
 */
export function AppHeader({ context, actions, home = '/' }: { context?: ReactNode; actions?: ReactNode; home?: string }) {
  return (
    <header className="app-header">
      <Logo to={home} />
      <nav className="app-nav" aria-label="Principal">
        <NavLink to="/app" end className={({ isActive }) => (isActive ? 'active' : '')}>Dashboard</NavLink>
        <NavLink to="/documentacao" className={({ isActive }) => (isActive ? 'active' : '')}>Documentação</NavLink>
      </nav>
      {context && <div className="app-context">{context}</div>}
      <div className="app-actions">{actions}</div>
    </header>
  )
}
