import { useId } from 'react'

const base =
  'w-full rounded-lg border border-line-strong bg-raised px-3 py-2.5 text-text placeholder:text-faint outline-none transition-colors focus:border-gold'

function Wrap({ id, label, hint, error, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm text-text">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-loss">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function Select({ label, hint, error, className, children, ...props }) {
  const id = useId()
  return (
    <Wrap id={id} label={label} hint={hint} error={error} className={className}>
      <select id={id} className={`${base} select-chevron appearance-none pr-9`} {...props}>
        {children}
      </select>
    </Wrap>
  )
}

export function Textarea({ label, hint, error, className, ...props }) {
  const id = useId()
  return (
    <Wrap id={id} label={label} hint={hint} error={error} className={className}>
      <textarea id={id} rows={3} className={base} {...props} />
    </Wrap>
  )
}

export function Input({ label, hint, error, className, ...props }) {
  const id = useId()
  return (
    <Wrap id={id} label={label} hint={hint} error={error} className={className}>
      <input id={id} className={base} {...props} />
    </Wrap>
  )
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto border-b border-line ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
            value === t.value ? 'border-gold text-text' : 'border-transparent text-muted hover:text-text'
          }`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs text-faint">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
