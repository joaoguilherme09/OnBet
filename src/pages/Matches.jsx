import { useState } from 'react'
import { Link } from 'react-router-dom'
import MatchCard from '../components/MatchCard'
import { Select, Tabs } from '../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { getCompetitions, getMatches } from '../services/catalogService'
import { formatDay } from '../utils/format'

export default function Matches() {
  const [scope, setScope] = useState('upcoming')
  const [competitionId, setCompetitionId] = useState('')
  const competitions = useAsync(() => getCompetitions(), [])
  const matches = useAsync(() => getMatches({ scope, competitionId: competitionId || undefined }), [scope, competitionId])

  // agrupa por dia
  const groups = []
  for (const m of matches.data ?? []) {
    const day = formatDay(m.scheduled_at)
    const last = groups.at(-1)
    if (last?.day === day) last.items.push(m)
    else groups.push({ day, items: [m] })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Partidas</h1>
          <p className="text-muted">Confrontos dos campeonatos da ORG ON Camps.</p>
        </div>
        <Select
          aria-label="Campeonato"
          className="w-full sm:w-64"
          value={competitionId}
          onChange={(e) => setCompetitionId(e.target.value)}
        >
          <option value="">Todos os campeonatos</option>
          {(competitions.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </header>

      <Tabs
        tabs={[
          { value: 'upcoming', label: 'Próximas' },
          { value: 'finished', label: 'Resultados' },
        ]}
        value={scope}
        onChange={setScope}
      />

      {matches.loading ? (
        <SkeletonRows rows={5} />
      ) : matches.error ? (
        <ErrorState error={matches.error} onRetry={matches.reload} />
      ) : !groups.length ? (
        <EmptyState title={scope === 'upcoming' ? 'Nenhuma partida agendada.' : 'Nenhum resultado ainda.'} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day} className="space-y-2">
              <h2 className="text-sm font-medium capitalize text-muted">{g.day}</h2>
              {g.items.map((m) => {
                const event = (m.events ?? []).find((e) => e.status !== 'draft')
                return (
                  <div key={m.id} className="space-y-1">
                    <MatchCard match={m} />
                    {event && (
                      <Link to={`/palpites/${event.id}`} className="block px-1 text-right text-xs text-gold hover:text-gold-bright">
                        {event.status === 'open' && new Date(event.closes_at) > new Date() ? 'Dar palpite' : 'Ver palpites'}
                      </Link>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
