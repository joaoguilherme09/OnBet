import { Link } from 'react-router-dom'
import { Flame, Timer, UsersRound } from 'lucide-react'
import Modal from './ui/Modal'
import OddButton from './OddButton'
import StatusBadge from './StatusBadge'
import TeamAvatar from './TeamAvatar'
import { EmptyState, ErrorState, SkeletonRows } from './ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { useBetSlip } from '../context/BetSlipContext'
import { eventDisplayStatus, getMatchMarkets, sortOptions } from '../services/predictionService'
import { CATEGORY_LABEL, formatClosesIn, formatDateTime, formatDay, formatScore, formatTime } from '../utils/format'

/**
 * Popup da partida: todas as apostas dela e as apostas abertas
 * relacionadas a um dos dois times/jogadores (campeão, marcos, outros jogos).
 */
export default function MatchMarketsModal({ match, onClose }) {
  const { placedCount } = useBetSlip()
  const markets = useAsync(() => getMatchMarkets(match), [match.id, placedCount])
  const finished = match.status === 'finished'

  return (
    <Modal open onClose={onClose} title={`${match.home?.name ?? '?'} x ${match.away?.name ?? '?'}`} size="lg">
      <div className="space-y-6">
        {/* placar / horário */}
        <div className="flex items-center justify-center gap-4 rounded-xl bg-raised/60 px-4 py-4 sm:gap-8">
          <TeamSide team={match.home} />
          <div className="text-center">
            {finished ? (
              <p className="num text-3xl font-bold text-gold-bright">{formatScore(match)}</p>
            ) : match.scheduled_at ? (
              <>
                <p className="num text-2xl font-bold text-gold-bright">{formatTime(match.scheduled_at)}</p>
                <p className="text-xs capitalize text-muted">{formatDay(match.scheduled_at)}</p>
              </>
            ) : (
              <p className="font-display text-3xl font-bold text-gold-bright">VS</p>
            )}
            {match.competition?.name && <p className="mt-1 max-w-48 truncate text-xs text-muted">{match.competition.name}</p>}
          </div>
          <TeamSide team={match.away} />
        </div>

        {markets.loading ? (
          <SkeletonRows rows={3} />
        ) : markets.error ? (
          <ErrorState error={markets.error} onRetry={markets.reload} />
        ) : (
          <>
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold uppercase tracking-wide">
                <Flame className="h-4 w-4 text-gold" aria-hidden="true" /> Apostas desta partida
              </h3>
              {markets.data.own.length ? (
                markets.data.own.map((e) => <Market key={e.id} event={e} onNavigate={onClose} />)
              ) : (
                <EmptyState title="Ainda não há apostas para esta partida." />
              )}
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold uppercase tracking-wide">
                <UsersRound className="h-4 w-4 text-gold" aria-hidden="true" /> Relacionadas aos jogadores
              </h3>
              {markets.data.related.length ? (
                markets.data.related.map(({ event, teams }) => (
                  <Market key={event.id} event={event} about={teams} onNavigate={onClose} />
                ))
              ) : (
                <EmptyState title="Nenhuma outra aposta aberta envolvendo estes jogadores." />
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}

function TeamSide({ team }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <TeamAvatar team={team} size="lg" />
      <p className="line-clamp-2 font-display text-lg font-bold">{team?.name}</p>
    </div>
  )
}

/** Um mercado (evento) com todas as opções clicáveis. */
function Market({ event, about = [], onNavigate }) {
  const { pick, isSelected } = useBetSlip()
  const status = eventDisplayStatus(event)
  const open = status === 'open'
  const options = sortOptions(event.options).filter((o) => o.status === 'active' || o.id === event.winning_option_id)
  // 1 X 2 sempre lado a lado; listas longas (ex.: campeão) quebram em 2 ou 3 colunas
  const cols =
    options.length === 3 ? 'grid-cols-3' : options.length === 2 || options.length === 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'

  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {CATEGORY_LABEL[event.category]}
            {about.map((t) => (
              <span key={t.id} className="rounded-full bg-gold/15 px-2 py-0.5 font-semibold text-gold-bright">
                {t.name}
              </span>
            ))}
          </p>
          <Link to={`/palpites/${event.id}`} onClick={onNavigate} className="font-semibold hover:text-gold-bright">
            {event.title}
          </Link>
        </div>
        {!open && <StatusBadge status={status} />}
      </header>

      <div className={`grid gap-2 ${cols}`}>
        {options.map((o) => (
          <OddButton
            key={o.id}
            label={o.name}
            odds={o.odds}
            disabled={!open}
            winner={event.winning_option_id === o.id}
            selected={isSelected(o.id)}
            onClick={() => pick(event, o)}
          />
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-faint">
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        {open
          ? formatClosesIn(event.closes_at)
          : status === 'settled'
            ? 'Resultado oficial definido'
            : status === 'void'
              ? 'Evento anulado'
              : `Encerrado em ${formatDateTime(event.closes_at)}`}
      </p>
    </article>
  )
}
