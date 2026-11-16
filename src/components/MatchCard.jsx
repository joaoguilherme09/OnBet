import TeamBadge from './TeamBadge'
import { formatDay, formatTime } from '../utils/format'

/**
 * Linha de confronto. Mostra horário (agendada) ou placar (finalizada).
 */
export default function MatchCard({ match }) {
  const finished = match.status === 'finished'
  return (
    <article className="card flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5 text-right">
        <span className="truncate font-medium">{match.home?.name}</span>
        <TeamBadge team={match.home} size="sm" />
      </div>

      <div className="w-20 shrink-0 text-center">
        {finished ? (
          <span className="num text-lg font-semibold">
            {match.home_score}
            <span className="px-1 text-faint">:</span>
            {match.away_score}
          </span>
        ) : (
          <>
            <span className="num block text-base font-semibold text-gold-bright">{formatTime(match.scheduled_at)}</span>
            <span className="block text-xs text-muted">{formatDay(match.scheduled_at)}</span>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TeamBadge team={match.away} size="sm" />
        <span className="truncate font-medium">{match.away?.name}</span>
      </div>

      <span className="hidden w-40 shrink-0 truncate text-right text-xs text-muted md:block">
        {match.competition?.name}
        {match.stage ? `, ${match.stage}` : ''}
      </span>
    </article>
  )
}
