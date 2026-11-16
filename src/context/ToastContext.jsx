import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)
const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info }
const TONES = {
  success: 'border-win/40 text-win',
  error: 'border-loss/40 text-loss',
  info: 'border-gold/40 text-gold-bright',
}

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback(
    (type, message) => {
      const id = nextId++
      setToasts((t) => [...t.slice(-3), { id, type, message }])
      setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4500)
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {toasts.map(({ id, type, message }) => {
          const Icon = ICONS[type]
          return (
            <div
              key={id}
              role={type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-card)] border bg-surface px-4 py-3 text-sm shadow-lg shadow-black/40 ${TONES[type]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-text">{message}</p>
              <button onClick={() => dismiss(id)} className="text-muted hover:text-text" aria-label="Fechar aviso">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
