import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './modal.css'

export function Modal({ title, description, onClose, children, footer, wide = false }: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDelete({ title, message, onCancel, onConfirm, busy }: {
  title: string
  message: string
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
}) {
  return (
    <Modal
      title={title}
      description="Esta ação não pode ser desfeita."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Excluindo…' : 'Excluir'}</button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  )
}
