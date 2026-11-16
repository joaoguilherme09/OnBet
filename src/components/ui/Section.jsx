import { Link } from 'react-router-dom'

/** Seção da home: título + link opcional + conteúdo. */
export default function Section({ title, to, linkLabel = 'Ver tudo', children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {to && (
          <Link to={to} className="text-sm text-muted hover:text-gold-bright">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}
