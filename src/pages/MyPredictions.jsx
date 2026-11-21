import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react'
import Coins from '../components/Coins'
import TeamBadge from '../components/TeamBadge'
import Button from '../components/ui/Button'
import { Tabs } from '../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../context/AuthContext'
import { getMyGames } from '../services/predictionService'
import { CATEGORY_LABEL, formatDateTime, formatOdds } from '../utils/format'

// Resultado do palpite, do ponto de vista do participante
const RESULT = {
  pending: { label: 'Aguardando', icon: Clock, tone: 'border-gold/40 text-gold-bright' },
  won: { label: 'Acertou', icon: CheckCircle2, tone: 'border-win/40 text-win' },
  lost: { label: 'Errou', icon: XCircle, tone: 'border-loss/40 text-loss' },
  void: { label: 'Anulado', icon: MinusCircle, tone: 'border-void/40 text-void' },
}

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'won', label: 'Acertei' },
  { value: 'lost', label: 'Errei' },
  { value: 'void', label: 'Anulados' },
]

export default function MyPredictions() {
  const { user } = useAuth()
  const games = useAsync(() => getMyGames({ userId: user?.id }), [user?.id])
  const [filter, setFilter] = useState('')

  // um card por aposta (não por jogo): apostar em A e em B no mesmo jogo gera dois cards
  const bets = useMemo(
    () =>
      (games.data ?? [])
        .flatMap((g) => g.picks.map((pick) => ({ event: g.event, pick })))
        .sort((a, b) => ((a.pick.created_at ?? '') < (b.pick.created_at ?? '') ? 1 : -1)),
    [games.data],
  )

  const counts = useMemo(() => {
    const c = { '': 0, pending: 0, won: 0, lost: 0, void: 0 }
    for (const b of bets) {
      c[''] += 1
      c[b.pick.status] = (c[b.pick.status] ?? 0) + 1
    }
    return c
  }, [bets])

  const list = bets.filter((b) => !filter || b.pick.status === filter)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Meus palpites</h1>
        <p className="text-muted">Cada aposta que você fez, com o placar, a opção escolhida e se ela bateu.</p>
      </header>

      {bets.length > 0 && (
        <dl className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Apostas</dt>
            <dd className="num text-2xl font-semibold">{counts['']}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Acertei</dt>
            <dd className="num text-2xl font-semibold text-win">{counts.won}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Errei</dt>
            <dd className="num text-2xl font-semibold text-loss">{counts.lost}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Aguardando</dt>
            <dd className="num text-2xl font-semibold text-gold-bright">{counts.pending}</dd>
          </div>
        </dl>
      )}

      <Tabs tabs={FILTERS.map((f) => ({ ...f, count: games.data ? counts[f.value] : null }))} value={filter} onChange={setFilter} />

      {games.loading ? (
        <SkeletonRows rows={5} />
      ) : games.error ? (
        <ErrorState error={games.error} onRetry={games.reload} />
      ) : !list.length ? (
        <EmptyState
          title={filter ? 'Nenhuma aposta com esse resultado.' : 'Você ainda não fez nenhuma aposta.'}
          action={
            !filter && (
              <Button as={Link} to="/palpites">
                Ver eventos abertos
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((b) => (
            <BetCard key={b.pick.id} event={b.event} pick={b.pick} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultBadge({ status, className = '' }) {
  const r = RESULT[status] ?? RESULT.pending
  const Icon = r.icon
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${r.tone} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {r.label}
    </span>
  )
}

const CARD_TONE = {
  won: 'border-l-4 border-l-win',
  lost: 'border-l-4 border-l-loss',
  void: 'border-l-4 border-l-void',
  pending: 'border-l-4 border-l-gold',
}

function BetCard({ event, pick }) {
  const match = event.match
  const winner = event.options?.find((o) => o.id === event.winning_option_id)
  const hasScore = match && match.home_score != null && match.away_score != null
  const isSingle = pick.kind === 'single'

  return (
    <li className={`card space-y-3 p-4 ${CARD_TONE[pick.status] ?? CARD_TONE.pending}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {CATEGORY_LABEL[event.category]}
            {match?.scheduled_at ? `, ${formatDateTime(match.scheduled_at)}` : ''}
          </p>
          {match?.home && match?.away ? (
            <Link to={`/palpites/${event.id}`} className="mt-1 flex items-center gap-2 hover:text-gold-bright">
              <TeamBadge team={match.home} size="sm" />
              <span className="truncate font-medium">{match.home.name}</span>
              <span className="num shrink-0 px-1 font-semibold text-gold-bright">
                {hasScore ? `${match.home_score} × ${match.away_score}` : '×'}
              </span>
              <span className="truncate font-medium">{match.away.name}</span>
              <TeamBadge team={match.away} size="sm" />
            </Link>
          ) : null}
          <Link
            to={`/palpites/${event.id}`}
            className={`block truncate hover:text-gold-bright ${match?.home ? 'mt-1 text-sm text-muted' : 'mt-0.5 font-medium'}`}
          >
            {event.title}
          </Link>
        </div>
        <ResultBadge status={pick.status} />
      </div>

      <div className="rounded-lg bg-raised/50 px-3 py-2.5 text-sm">
        <p>
          <span className="text-muted">Sua aposta: </span>
          <span className="font-semibold">{pick.option?.name}</span>
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <dt className="text-xs text-muted">Apostado</dt>
            <dd className="font-medium">
              <Coins value={isSingle ? pick.stake : pick.parlay?.stake} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Odd</dt>
            <dd className="num font-medium text-gold-bright">{formatOdds(pick.odds)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{isSingle && pick.status !== 'pending' ? 'Retorno' : 'Retorno possível'}</dt>
            <dd className="font-medium">
              {!isSingle ? (
                <span className="text-muted">ver múltipla</span>
              ) : pick.status === 'pending' ? (
                <Coins value={pick.potential_payout} />
              ) : pick.status === 'lost' ? (
                <span className="text-loss">sem retorno</span>
              ) : (
                <Coins value={pick.payout} className="text-win" />
              )}
            </dd>
          </div>
        </dl>
        {!isSingle && (
          <p className="mt-2 text-xs text-muted">
            Dentro de uma múltipla de odd {formatOdds(pick.parlay?.total_odds)}: o valor apostado é o da múltipla inteira.
          </p>
        )}
      </div>

      <p className="text-sm">
        <span className="text-muted">Resultado do evento: </span>
        {event.status === 'settled' && winner ? (
          <span className="font-medium">{winner.name}</span>
        ) : event.status === 'void' ? (
          <span className="text-void">evento anulado{event.void_reason ? ` (${event.void_reason})` : ''}</span>
        ) : (
          <span className="text-muted">ainda não definido</span>
        )}
      </p>
    </li>
  )
}
