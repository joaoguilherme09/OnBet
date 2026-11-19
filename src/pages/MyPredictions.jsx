import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react'
import Coins from '../components/Coins'
import TeamBadge from '../components/TeamBadge'
import Button from '../components/ui/Button'
import { Tabs } from '../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
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
  const games = useAsync(() => getMyGames(), [])
  const [filter, setFilter] = useState('')

  const counts = useMemo(() => {
    const c = { '': 0, pending: 0, won: 0, lost: 0, void: 0 }
    for (const g of games.data ?? []) {
      c[''] += 1
      c[g.status] += 1
    }
    return c
  }, [games.data])

  const list = (games.data ?? []).filter((g) => !filter || g.status === filter)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Meus palpites</h1>
        <p className="text-muted">Os jogos em que você palpitou, o resultado oficial e se o seu palpite bateu.</p>
      </header>

      {games.data && games.data.length > 0 && (
        <dl className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Jogos</dt>
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
          title={filter ? 'Nenhum jogo com esse resultado.' : 'Você ainda não palpitou em nenhum jogo.'}
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
          {list.map((g) => (
            <GameRow key={g.event.id} game={g} />
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

function GameRow({ game }) {
  const { event, picks, status } = game
  const match = event.match
  const winner = event.options?.find((o) => o.id === event.winning_option_id)
  const hasScore = match && match.home_score != null && match.away_score != null

  return (
    <li className="card space-y-3 p-4">
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
        <ResultBadge status={status} />
      </div>

      <p className="text-sm">
        <span className="text-muted">Resultado oficial: </span>
        {event.status === 'settled' && winner ? (
          <span className="font-medium">{winner.name}</span>
        ) : event.status === 'void' ? (
          <span className="text-void">evento anulado{event.void_reason ? ` (${event.void_reason})` : ''}</span>
        ) : (
          <span className="text-muted">ainda não definido</span>
        )}
      </p>

      <ul className="divide-y divide-line rounded-lg bg-raised/50">
        {picks.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p>
                <span className="text-muted">Seu palpite: </span>
                <span className="font-medium">{p.option?.name}</span>{' '}
                <span className="num text-gold-bright">{formatOdds(p.odds)}</span>
              </p>
              <p className="text-xs text-muted">
                {p.kind === 'single' ? (
                  <>
                    Simples, <Coins value={p.stake} /> usados
                    {p.status === 'pending' ? (
                      <>
                        , retorno possível <Coins value={p.potential_payout} />
                      </>
                    ) : p.status === 'lost' ? (
                      ', sem retorno'
                    ) : (
                      <>
                        , creditado <Coins value={p.payout} className="text-win" />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Dentro de uma múltipla ({formatOdds(p.parlay?.total_odds)}, <Coins value={p.parlay?.stake} /> usados)
                  </>
                )}
              </p>
            </div>
            <ResultBadge status={p.status} />
          </li>
        ))}
      </ul>
    </li>
  )
}
