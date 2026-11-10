import { Link } from 'react-router-dom'

/** Marca do Driftor: uma série que muda de nível, com o ponto do desvio em âmbar. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#202b3a" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="rgba(77,143,192,0.45)" />
      <path d="M6 21h6l3-8 4 12 3-6h4" fill="none" stroke="#4d8fc0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19" cy="25" r="2.6" fill="#f59e0b" />
    </svg>
  )
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Driftor, página inicial">
      <LogoMark />
      <span className="logo-word">Driftor</span>
    </Link>
  )
}
