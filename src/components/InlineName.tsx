import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'

/** Título editável no lugar: o Update dos dois CRUDs. */
export function InlineName({ value, onSave, label }: { value: string; onSave: (name: string) => Promise<void> | void; label: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => { if (editing) ref.current?.select() }, [editing])

  async function commit() {
    const name = draft.trim()
    setEditing(false)
    if (!name || name === value) { setDraft(value); return }
    setSaving(true)
    try { await onSave(name) } catch { setDraft(value) } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <input
        ref={ref}
        aria-label={label}
        className="inline-name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
      />
    )
  }
  return (
    <button type="button" className="inline-name" onClick={() => setEditing(true)} title="Renomear" aria-label={`${label}: ${value}. Clique para renomear`}>
      <span>{saving ? draft : value}</span>
      <Pencil size={12} aria-hidden="true" />
    </button>
  )
}
