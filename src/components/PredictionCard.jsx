import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import { useBetSlip } from '../context/BetSlipContext'
import { eventDisplayStatus, sortOptions } from '../services/predictionService'
import { CATEGORY_LABEL, formatClosesIn, formatDateTime, formatOdds } from '../utils/format'

/** Card de evento com odds clicáveis (abrem o cupom). */
export default function PredictionCard({ event, compact = false }) {
  const { pick, selectedOptionId } = useBetSlip()
  const status = eventDisplayStatus(event)
  const canPick = status === 'open'
  const options = sortOptions(event.options).filter((o) => o.status === 'active' || o.id === event.winning_option_id)
  const cols = options.length === 3 ? 'grid-cols-3' : options.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
  const visible = compact ? options.slice(0, 6) : options

  return (
    <article className="card flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted">
            {CATEGORY_LABEL[event.category]}
            {event.competition?.name ? ` em ${event.competition.name}` : ''}
          </p>
          <h3 className="text-base font-semibold">
            <Link to={`/palpites/${event.id}`} className="hover:text-gold-bright">
              {event.title}
            </Link>
          </h3>
        </div>
        {status !== 'open' && <StatusBadge status={status} />}
      </header>

      <ul className={`grid gap-2 ${cols}`}>
        {visible.map((o) => {
          const winner = event.winning_option_id === o.id
          const selected = selectedOptionId === o.id
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={!canPick}
                onClick={() => pick(event, o)}
                aria-label={`${o.name}, odd ${formatOdds(o.odds)}`}
                className={`chamfer flex w-full flex-col items-center gap-0.5 px-2 py-2.5 transition-colors disabled:cursor-default ${
                  selected
                    ? 'bg-gold text-on-gold'
                    : winner
                      ? 'bg-gold/15 ring-1 ring-gold'
                      : 'bg-raised enabled:hover:bg-line-strong'
                }`}
              >
                <span className={`w-full truncate text-center text-xs ${selected ? 'text-on-gold' : 'text-muted'}`}>{o.name}</span>
                <span className={`num text-lg font-semibold ${selected ? 'text-on-gold' : canPick || winner ? 'text-gold-bright' : 'text-faint'}`}>
                  {formatOdds(o.odds)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {compact && options.length > visible.length && (
        <Link to={`/palpites/${event.id}`} className="-mt-2 text-xs text-muted hover:text-text">
          Ver todas as {options.length} opções
        </Link>
      )}

      <p className="text-xs text-faint">
        {status === 'open'
          ? formatClosesIn(event.closes_at)
          : status === 'soon'
            ? `Abre em ${formatDateTime(event.opens_at)}`
            : status === 'void'
              ? `Anulado${event.void_reason ? `: ${event.void_reason}` : ''}`
              : status === 'settled'
                ? 'Resultado oficial definido'
                : `Encerrado em ${formatDateTime(event.closes_at)}`}
      </p>
    </article>
  )
}
