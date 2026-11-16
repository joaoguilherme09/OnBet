import { isSupabaseConfigured } from '../services/supabase'
import {
  getOngoingCompetitions,
  getRecentResults,
  getUpcomingMatches,
} from '../services/catalogService'
import { useAsync } from '../hooks/useAsync'
import NextMatchHero from '../components/NextMatchHero'
import MatchCard from '../components/MatchCard'
import PredictionCard from '../components/PredictionCard'
import Section from '../components/ui/Section'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import WalletCard from '../components/WalletCard'
import RankingCard from '../components/RankingCard'
import Coins from '../components/Coins'
import { getHighlights, getRanking } from '../services/rankingService'
import { useBetSlip } from '../context/BetSlipContext'
import { getEvents } from '../services/predictionService'
import { formatOdds } from '../utils/format'

export default function Home() {
  if (!isSupabaseConfigured) return <SetupNotice />
  return <Dashboard />
}

function Dashboard() {
  const upcoming = useAsync(() => getUpcomingMatches(7), [])
  const events = useAsync(() => getEvents({ scope: 'open', limit: 6 }), [])
  const results = useAsync(() => getRecentResults(5), [])
  const competitions = useAsync(() => getOngoingCompetitions(), [])
  const { placedCount } = useBetSlip()
  const ranking = useAsync(() => getRanking(5), [placedCount])
  const highlights = useAsync(() => getHighlights(30, 4), [])

  const [next, ...rest] = upcoming.data ?? []

  return (
    <div className="space-y-10">
      {upcoming.loading ? (
        <div className="h-56 animate-pulse rounded-[var(--radius-card)] bg-surface" aria-hidden="true" />
      ) : upcoming.error ? (
        <ErrorState error={upcoming.error} onRetry={upcoming.reload} />
      ) : (
        <NextMatchHero match={next} />
      )}

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-10">
          <Section title="Palpites abertos" to="/palpites">
            <Async state={events} empty="Nenhum evento aberto agora." emptyHint="Novos eventos aparecem quando a administração abre os palpites da rodada.">
              {(list) => (
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                  {list.map((e) => <PredictionCard key={e.id} event={e} compact />)}
                </div>
              )}
            </Async>
          </Section>

          <Section title="Próximos confrontos" to="/partidas">
            <Async state={{ ...upcoming, data: rest }} empty="Sem outros confrontos agendados.">
              {(list) => <div className="space-y-2">{list.map((m) => <MatchCard key={m.id} match={m} />)}</div>}
            </Async>
          </Section>

          <Section title="Últimos resultados" to="/partidas">
            <Async state={results} empty="Nenhuma partida finalizada ainda.">
              {(list) => <div className="space-y-2">{list.map((m) => <MatchCard key={m.id} match={m} />)}</div>}
            </Async>
          </Section>
        </div>

        <aside className="space-y-10">
          <WalletCard />

          <Section title="Ranking" to="/ranking">
            <Async state={ranking} empty="Ninguém no ranking ainda.">
              {(rows) => <RankingCard rows={rows} />}
            </Async>
          </Section>

          <Section title="Destaques">
            <Async state={highlights} empty="Sem acertos nos últimos 30 dias." emptyHint="Os maiores acertos apurados aparecem aqui.">
              {(rows) => (
                <ul className="space-y-2">
                  {rows.map((h, i) => (
                    <li key={i} className="card px-4 py-3">
                      <p className="text-sm">
                        <span className="font-semibold text-text">{h.username}</span>
                        <span className="text-muted"> acertou {h.option_name} </span>
                        <span className="num text-gold-bright">({formatOdds(h.odds)})</span>
                      </p>
                      <p className="flex items-center justify-between gap-2 text-xs text-muted">
                        <span className="truncate">{h.event_title}</span>
                        <Coins value={h.payout} signed className="text-win" />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Async>
          </Section>

          <Section title="Campeonatos em andamento">
            <Async state={competitions} empty="Nenhum campeonato em andamento.">
              {(list) => (
                <ul className="space-y-2">
                  {list.map((c) => (
                    <li key={c.id} className="card px-4 py-3">
                      <p className="font-medium">{c.name}</p>
                      {c.description && <p className="line-clamp-2 text-sm text-muted">{c.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Async>
          </Section>


        </aside>
      </div>
    </div>
  )
}

/** Renderiza carregando / erro / vazio / conteúdo para um useAsync. */
function Async({ state, empty, emptyHint, children }) {
  if (state.loading) return <SkeletonRows rows={2} />
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />
  if (!state.data?.length) return <EmptyState title={empty}>{emptyHint}</EmptyState>
  return children(state.data)
}

function SetupNotice() {
  return (
    <div className="card mx-auto max-w-xl space-y-3 p-6">
      <h1 className="text-xl font-semibold">Conecte o Supabase</h1>
      <p className="text-muted">
        Crie o arquivo <code className="text-gold-bright">.env.local</code> na raiz do projeto com
        <code className="text-gold-bright"> VITE_SUPABASE_URL</code> e
        <code className="text-gold-bright"> VITE_SUPABASE_ANON_KEY</code>, rode as migrations e reinicie o
        <code className="text-gold-bright"> npm run dev</code>. O passo a passo está no README.
      </p>
    </div>
  )
}
