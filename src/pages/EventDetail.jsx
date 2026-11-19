import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import TeamBadge from '../components/TeamBadge'
import StatusBadge from '../components/StatusBadge'
import Coins from '../components/Coins'
import { EmptyState, ErrorState, Loading } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../context/AuthContext'
import { useBetSlip } from '../context/BetSlipContext'
import {
  eventDisplayStatus,
  getDistribution,
  getEvent,
  getMyPredictionsForEvent,
  sortOptions,
} from '../services/predictionService'
import { CATEGORY_LABEL, formatClosesIn, formatDateTime, formatOdds } from '../utils/format'

export default function EventDetail() {
  const { id } = useParams()
  const { isAuthenticated } = useAuth()
  const { pick, isSelected, placedCount } = useBetSlip()
  const event = useAsync(() => getEvent(id), [id])
  const dist = useAsync(() => getDistribution(id), [id, placedCount])
  const mine = useAsync(() => (isAuthenticated ? getMyPredictionsForEvent(id) : Promise.resolve([])), [id, isAuthenticated, placedCount])

  if (event.loading) return <Loading />
  if (event.error) return <ErrorState error={event.error} onRetry={event.reload} />
  if (!event.data) return <EmptyState title="Evento não encontrado.">Ele pode ter sido removido ou ainda não foi publicado.</EmptyState>

  const e = event.data
  const status = eventDisplayStatus(e)
  const options = sortOptions(e.options).filter((o) => o.status === 'active' || o.id === e.winning_option_id)
  const counts = dist.data ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/palpites" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Palpites
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">
            {CATEGORY_LABEL[e.category]}
            {e.competition?.name ? ` em ${e.competition.name}` : ''}
          </span>
          <StatusBadge status={status} />
        </div>
        <h1 className="text-3xl font-bold">{e.title}</h1>
        {e.description && <p className="max-w-prose text-muted">{e.description}</p>}
        <p className="text-sm text-faint">
          {status === 'open' ? `${formatClosesIn(e.closes_at)} (${formatDateTime(e.closes_at)})` : `Prazo: ${formatDateTime(e.closes_at)}`}
        </p>
      </header>

      {e.match && (
        <div className="card flex items-center justify-center gap-4 px-4 py-5 sm:gap-8">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-semibold">{e.match.home?.name}</span>
            <TeamBadge team={e.match.home} />
          </div>
          <span className="num text-xl font-bold text-gold-bright">
            {e.match.status === 'finished' ? `${e.match.home_score} : ${e.match.away_score}` : e.match.scheduled_at ? formatDateTime(e.match.scheduled_at) : 'x'}
          </span>
          <div className="flex items-center gap-3">
            <TeamBadge team={e.match.away} />
            <span className="font-display text-lg font-semibold">{e.match.away?.name}</span>
          </div>
        </div>
      )}

      <section className="space-y-2" aria-label="Opções">
        {options.map((o) => {
          const n = counts[o.id] ?? 0
          const pct = total ? Math.round((n / total) * 100) : 0
          const winner = e.winning_option_id === o.id
          const selected = isSelected(o.id)
          return (
            <button
              key={o.id}
              type="button"
              disabled={status !== 'open'}
              onClick={() => pick(e, o)}
              className={`card relative flex w-full items-center gap-4 overflow-hidden px-4 py-3 text-left transition-colors enabled:hover:border-gold ${
                winner || selected ? 'border-gold' : ''
              }`}
            >
              <span className="absolute inset-y-0 left-0 bg-gold/8" style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className="relative flex-1">
                <span className="block font-medium">
                  {o.name}
                  {winner && <span className="ml-2 text-xs text-gold-bright">Resultado oficial</span>}
                </span>
                {o.description && <span className="block text-xs text-muted">{o.description}</span>}
                <span className="block text-xs text-faint">
                  {n} {n === 1 ? 'palpite' : 'palpites'}
                  {total ? `, ${pct}%` : ''}
                </span>
              </span>
              <span className={`chamfer num relative px-3 py-1.5 text-lg font-semibold ${selected ? 'bg-gold text-on-gold' : status === 'open' ? 'bg-raised text-gold-bright' : 'text-faint'}`}>
                {formatOdds(o.odds)}
              </span>
            </button>
          )
        })}
      </section>

      {e.rules && (
        <section className="card space-y-1 p-4">
          <h2 className="text-base font-semibold">Regras</h2>
          <p className="whitespace-pre-line text-sm text-muted">{e.rules}</p>
        </section>
      )}
      {status === 'void' && e.void_reason && (
        <p className="rounded-lg border border-void/40 px-4 py-3 text-sm text-muted">Evento anulado: {e.void_reason}. Os pontos foram devolvidos.</p>
      )}

      {isAuthenticated && (mine.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Seus palpites neste evento</h2>
          <ul className="card divide-y divide-line">
            {mine.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1">
                  {p.option?.name} <span className="num text-muted">({formatOdds(p.odds_snapshot)})</span>
                </span>
                <Coins value={p.stake} />
                <StatusBadge status={p.status} />
                <span className="text-xs text-faint">{formatDateTime(p.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
