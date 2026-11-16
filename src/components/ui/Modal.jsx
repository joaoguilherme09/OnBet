import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * Diálogo acessível. No celular vira uma folha que sobe de baixo.
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    setTimeout(() => (panel.current?.querySelector('input:not([type=radio]):not([type=checkbox]), select, textarea') ?? panel.current)?.focus(), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  const width = size === 'lg' ? 'sm:max-w-2xl' : size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl outline-none sm:rounded-[var(--radius-card)] ${width}`}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}
