import { AlertTriangle, RotateCw } from 'lucide-react'
import Mascot from '../Mascot'

export function Loading({ label = 'Carregando…', className = '' }) {
  return (
    <div role="status" className={`flex items-center gap-3 py-8 text-sm text-muted ${className}`}>
      <Mascot className="h-8 w-8" bob />
      {label}
    </div>
  )
}

export function SkeletonRows({ rows = 3 }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-card)] border border-loss/40 bg-loss/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-text">Não foi possível carregar.</p>
        <p className="text-muted">{error?.message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 text-gold hover:text-gold-bright">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Tentar de novo
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-[var(--radius-card)] border border-dashed border-line-strong p-5">
      <p className="text-text">{title}</p>
      {children && <p className="text-sm text-muted">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
