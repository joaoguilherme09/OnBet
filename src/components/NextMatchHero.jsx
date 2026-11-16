import TeamBadge from './TeamBadge'
import Mascot from './Mascot'
import { formatDay, formatTime } from '../utils/format'

/** Destaque da home: o próximo confronto da ORG ON Camps. */
export default function NextMatchHero({ match }) {
  if (!match) {
    return (
      <section className="card flex items-center gap-5 p-6">
        <Mascot className="h-16 w-16" />
        <div>
          <h1 className="text-2xl font-semibold">Nenhum confronto agendado</h1>
          <p className="text-muted">Assim que a organização marcar a próxima rodada, ela aparece aqui.</p>
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label="Próximo confronto"
      className="card relative overflow-hidden px-5 py-7 sm:px-10 sm:py-10"
    >
      {/* linha dourada de "placar" no topo */}
      <div className="absolute inset-x-0 top-0 h-px bg-gold/60" aria-hidden="true" />

      <p className="text-center text-sm text-muted">
        Próximo confronto, {match.competition?.name}
        {match.stage ? `, ${match.stage}` : ''}
      </p>

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <TeamBadge team={match.home} size="lg" />
          <h1 className="text-xl font-bold sm:text-4xl">{match.home?.name}</h1>
        </div>

        <div className="text-center">
          <p className="num text-3xl font-bold text-gold-bright sm:text-5xl">{formatTime(match.scheduled_at)}</p>
          <p className="mt-1 text-sm capitalize text-muted">{formatDay(match.scheduled_at)}</p>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <TeamBadge team={match.away} size="lg" />
          <h1 className="text-xl font-bold sm:text-4xl">{match.away?.name}</h1>
        </div>
      </div>
    </section>
  )
}
