import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Campo de formulário com rótulo, dica e erro acessíveis. */
export default function Field({ label, hint, error, type = 'text', className = '', ...props }) {
  const id = useId()
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-sm text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`w-full rounded-lg border bg-raised px-3 py-2.5 text-text placeholder:text-faint outline-none transition-colors focus:border-gold ${
            error ? 'border-loss/70' : 'border-line-strong'
          } ${isPassword ? 'pr-11' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-text"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-err`} className="text-xs text-loss">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
