import Mascot from './Mascot'

/** Moldura das telas de autenticação. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto w-full max-w-sm py-6 sm:py-12">
      <div className="mb-6 flex items-center gap-3">
        <Mascot className="h-11 w-11" />
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="card p-5 sm:p-6">{children}</div>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </div>
  )
}
