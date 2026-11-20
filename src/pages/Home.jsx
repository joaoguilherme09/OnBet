import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Gift, Landmark, LayoutGrid, Swords, Timer, TrendingUp, Trophy, Wallet, Zap } from 'lucide-react'
import { isSupabaseConfigured } from '../services/supabase'
import { getRecentResults, getUpcomingMatches } from '../services/catalogService'
import { getEvents, getSettings, isEventOpen, sortOptions } from '../services/predictionService'
import { getHighlights, getRanking } from '../services/rankingService'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { useBetSlip } from '../context/BetSlipContext'
import OddButton from '../components/OddButton'
import PredictionCard from '../components/PredictionCard'
import RankingCard from '../components/RankingCard'
import TeamAvatar from '../components/TeamAvatar'
import Coins from '../components/Coins'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { CATEGORY_LABEL, formatClosesIn, formatCoins, formatDay, formatOdds, formatTime, hasPenalties } from '../utils/format'

const SOON_MS = 3 * 60 * 60 * 1000 // "fecha em breve": menos de 3 horas

const CATEGORIES = [
  { value: '', label: 'Todos', icon: LayoutGrid },
  { value: 'match', label: 'Partidas', icon: Swords },
  { value: 'competition', label: 'Campeões', icon: Trophy },
  { value: 'milestone', label: 'Marcos', icon: Landmark },
]

export default function Home() {
  if (!isSupabaseConfigured) return <SetupNotice />
  return <Sportsbook />
}

function Sportsbook() {
  const { placedCount } = useBetSlip()
  const events = useAsync(() => getEvents({ scope: 'open', limit: 40 }), [placedCount])
  const upcoming = useAsync(() => getUpcomingMatches(10), [])
  const results = useAsync(() => getRecentResults(4), [])
  const ranking = useAsync(() => getRanking(5), [placedCount])
  const highlights = useAsync(() => getHighlights(30, 10), [])
  const [category, setCategory] = useState('')

  const open = useMemo(() => (events.data ?? []).filter((e) => isEventOpen(e)), [events.data])
  // destaque: a partida aberta que fecha primeiro (ou qualquer evento aberto)
  const featured = open.find((e) => e.match && activeOptions(e).length >= 2) ?? open[0] ?? null
  const rest = open.filter((e) => e.id !== featured?.id)
  const list = category ? rest.filter((e) => e.category === category) : rest
  const counts = useMemo(() => {
    const c = { '': open.length, match: 0, competition: 0, milestone: 0 }
    for (const e of open) c[e.category] = (c[e.category] ?? 0) + 1
    return c
  }, [open])

  const stats = useMemo(() => {
    const now = Date.now()
    let maxOdd = 0
    for (const e of open) for (const o of activeOptions(e)) maxOdd = Math.max(maxOdd, Number(o.odds))
    return {
      open: open.length,
      maxOdd,
      closing24h: open.filter((e) => new Date(e.closes_at).getTime() - now < 24 * 60 * 60 * 1000).length,
    }
  }, [open])

  return (
    <div className="space-y-6">
      {highlights.data?.length > 0 && <WinsTicker rows={highlights.data} />}

      {/* topo: jogo em destaque + números */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        {events.loading ? (
          <div className="h-72 animate-pulse rounded-2xl bg-surface" aria-hidden="true" />
        ) : events.error ? (
          <ErrorState error={events.error} onRetry={events.reload} />
        ) : (
          <FeaturedEvent event={featured} />
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-[auto_1fr]">
          <BalanceTile />
          <div className="col-span-2 grid grid-cols-3 gap-2 sm:gap-3 lg:col-span-1">
            <StatTile icon={Zap} label="Abertos" value={events.loading ? '–' : stats.open} />
            <StatTile icon={TrendingUp} label="Maior odd" value={events.loading || !stats.maxOdd ? '–' : formatOdds(stats.maxOdd)} highlight />
            <StatTile icon={Timer} label="Fecham em 24 h" value={events.loading ? '–' : stats.closing24h} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {/* menu de categorias */}
          <nav aria-label="Categorias de apostas" className="sticky top-16 z-10 -mx-4 bg-ink/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
            <ul className="flex gap-2 overflow-x-auto">
              {CATEGORIES.map(({ value, label, icon: Icon }) => {
                const active = category === value
                return (
                  <li key={value}>
                    <button
                      type="button"
                      onClick={() => setCategory(value)}
                      aria-pressed={active}
                      className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                        active ? 'bg-gold text-on-gold' : 'bg-surface text-muted hover:bg-raised hover:text-text'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                      <span className={`num rounded-full px-1.5 text-xs ${active ? 'bg-on-gold/15' : 'bg-raised text-faint'}`}>
                        {events.loading ? '·' : counts[value] - (featured && (!value || featured.category === value) ? 1 : 0)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <section aria-labelledby="apostas-abertas" className="space-y-3">
            <SectionTitle id="apostas-abertas" icon={Flame} to="/palpites">
              Apostas abertas
            </SectionTitle>
            {events.loading ? (
              <SkeletonRows rows={4} />
            ) : events.error ? null : !list.length ? (
              <EmptyState title={open.length ? 'Nada nesta categoria agora.' : 'Nenhum evento aberto agora.'}>
                Novos eventos aparecem quando a administração abre os palpites da rodada.
              </EmptyState>
            ) : (
              <>
                {list.some(isMatchRow) && (
                  <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                    {list.filter(isMatchRow).map((e) => (
                      <MatchEventRow key={e.id} event={e} />
                    ))}
                  </ul>
                )}
                {list.some((e) => !isMatchRow(e)) && (
                  <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
                    {list.filter((e) => !isMatchRow(e)).map((e) => (
                      <PredictionCard key={e.id} event={e} compact />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="proximos-jogos" className="space-y-3">
            <SectionTitle id="proximos-jogos" icon={Swords} to="/partidas">
              Próximos jogos
            </SectionTitle>
            {upcoming.loading ? (
              <SkeletonRows rows={1} />
            ) : upcoming.error ? (
              <ErrorState error={upcoming.error} onRetry={upcoming.reload} />
            ) : !upcoming.data.length ? (
              <EmptyState title="Nenhum jogo agendado." />
            ) : (
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
                {upcoming.data.map((m) => (
                  <UpcomingCard key={m.id} match={m} event={open.find((e) => e.match_id === m.id)} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="resultados" className="space-y-3">
            <SectionTitle id="resultados" icon={Trophy} to="/partidas">
              Resultados
            </SectionTitle>
            {results.loading ? (
              <SkeletonRows rows={2} />
            ) : results.error ? (
              <ErrorState error={results.error} onRetry={results.reload} />
            ) : !results.data.length ? (
              <EmptyState title="Nenhuma partida finalizada ainda." />
            ) : (
              <ul className="space-y-2">
                {results.data.map((m) => (
                  <ResultCard key={m.id} match={m} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="ranking" className="space-y-3">
            <SectionTitle id="ranking" icon={TrendingUp} to="/ranking">
              Top 5
            </SectionTitle>
            {ranking.loading ? (
              <SkeletonRows rows={2} />
            ) : ranking.error ? (
              <ErrorState error={ranking.error} onRetry={ranking.reload} />
            ) : !ranking.data.length ? (
              <EmptyState title="Ninguém no ranking ainda." />
            ) : (
              <RankingCard rows={ranking.data} />
            )}
          </section>
        </aside>
      </div>

      <p className="text-center text-xs text-faint">
        ON Coins são pontos virtuais, sem valor em dinheiro. Não há depósitos, saques nem prêmios.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

const activeOptions = (e) => sortOptions(e.options).filter((o) => o.status === 'active')
const isMatchRow = (e) => e.match?.home && e.match?.away && activeOptions(e).length >= 2 && activeOptions(e).length <= 3
const closingSoon = (e) => new Date(e.closes_at).getTime() - Date.now() < SOON_MS

/** Rótulos 1 / X / 2 quando as opções são mandante, empate e visitante. */
function oddLabel(event, option) {
  const m = event.match
  if (m && option.team_id === m.home?.id) return '1'
  if (m && option.team_id === m.away?.id) return '2'
  if (m && !option.team_id && /empate/i.test(option.name)) return 'X'
  return option.name
}

function SectionTitle({ id, icon: Icon, to, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id={id} className="flex items-center gap-2 text-xl font-bold uppercase tracking-wide">
        <Icon className="h-5 w-5 text-gold" aria-hidden="true" />
        {children}
      </h2>
      {to && (
        <Link to={to} className="text-sm font-semibold text-gold-bright hover:underline">
          Ver tudo
        </Link>
      )}
    </div>
  )
}

function SoonBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-loss/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-loss">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-loss opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-loss" />
      </span>
      Fecha em breve
    </span>
  )
}

/** Faixa animada com os últimos acertos (para no hover; parada para quem prefere menos movimento). */
function WinsTicker({ rows }) {
  const items = [...rows, ...rows] // duplicado para a rolagem emendar
  return (
    <div className="relative -mx-4 overflow-hidden border-y border-line bg-surface sm:mx-0 sm:rounded-xl sm:border" aria-label="Últimos acertos">
      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-1.5 bg-gold px-3 font-display text-xs font-bold uppercase tracking-wide text-on-gold">
        <Flame className="h-4 w-4" aria-hidden="true" /> Acertos
      </div>
      <ul className="flex w-max gap-8 py-2.5 pl-32 motion-safe:animate-marquee hover:[animation-play-state:paused]">
        {items.map((h, i) => (
          <li key={i} className="flex shrink-0 items-center gap-2 text-sm" aria-hidden={i >= rows.length}>
            <span className="font-semibold text-text">{h.username}</span>
            <span className="text-muted">acertou</span>
            <span className="max-w-48 truncate">{h.option_name}</span>
            <span className="num rounded bg-raised px-1.5 text-gold-bright">{formatOdds(h.odds)}</span>
            <Coins value={h.payout} signed className="font-bold text-win" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Jogo em destaque: banner grande com as odds clicáveis. */
function FeaturedEvent({ event }) {
  const { pick, isSelected } = useBetSlip()
  if (!event) {
    return (
      <section className="flex min-h-56 flex-col items-start justify-center gap-3 rounded-2xl border border-line bg-linear-to-br from-surface to-raised p-6">
        <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold-bright">Em breve</span>
        <h1 className="text-2xl font-bold sm:text-3xl">Nenhuma aposta aberta agora</h1>
        <p className="text-muted">Assim que a organização abrir os palpites da rodada, o jogo em destaque aparece aqui.</p>
      </section>
    )
  }
  const m = event.match
  const options = activeOptions(event).slice(0, 4)
  return (
    <section
      aria-label="Jogo em destaque"
      className="relative overflow-hidden rounded-2xl border border-gold/40 bg-linear-to-br from-raised via-surface to-ink p-5 sm:p-7"
    >
      {/* brilho na cor do tema */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-gold/10 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-on-gold">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" /> Em destaque
        </span>
        <span className="text-sm text-muted">
          {event.competition?.name ?? CATEGORY_LABEL[event.category]}
          {m?.stage ? `, ${m.stage}` : ''}
        </span>
        {closingSoon(event) && <SoonBadge />}
      </div>

      {m?.home && m?.away ? (
        <Link to={`/palpites/${event.id}`} className="relative mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamAvatar team={m.home} size="lg" />
            <h1 className="line-clamp-2 text-lg font-bold sm:text-3xl">{m.home.name}</h1>
          </div>
          <div className="text-center">
            <p className="font-display text-3xl font-bold text-gold-bright sm:text-5xl">VS</p>
            {m.scheduled_at && (
              <p className="mt-1 text-xs capitalize text-muted sm:text-sm">
                {formatDay(m.scheduled_at)}, {formatTime(m.scheduled_at)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamAvatar team={m.away} size="lg" />
            <h1 className="line-clamp-2 text-lg font-bold sm:text-3xl">{m.away.name}</h1>
          </div>
        </Link>
      ) : (
        <Link to={`/palpites/${event.id}`} className="relative mt-5 block">
          <h1 className="text-2xl font-bold hover:text-gold-bright sm:text-4xl">{event.title}</h1>
        </Link>
      )}

      <div className={`relative mt-6 grid gap-2 sm:gap-3 ${options.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {options.map((o) => (
          <OddButton
            key={o.id}
            size="lg"
            label={o.name}
            odds={o.odds}
            selected={isSelected(o.id)}
            onClick={() => pick(event, o)}
          />
        ))}
      </div>

      <p className="relative mt-4 flex items-center justify-between gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" /> {formatClosesIn(event.closes_at)}
        </span>
        <Link to={`/palpites/${event.id}`} className="font-semibold text-gold-bright hover:underline">
          Mais detalhes
        </Link>
      </p>
    </section>
  )
}

/** Linha de partida com odds 1 X 2, como numa casa de aposta. */
function MatchEventRow({ event }) {
  const { pick, isSelected } = useBetSlip()
  const m = event.match
  const options = activeOptions(event)
  return (
    <li className="grid grid-cols-1 gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
      <Link to={`/palpites/${event.id}`} className="min-w-0 space-y-1.5 hover:text-gold-bright">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="truncate">{event.competition?.name ?? CATEGORY_LABEL[event.category]}</span>
          {closingSoon(event) ? <SoonBadge /> : <span className="text-faint">{formatClosesIn(event.closes_at)}</span>}
        </p>
        <p className="flex items-center gap-2 font-semibold">
          <TeamAvatar team={m.home} size="sm" />
          <span className="truncate">{m.home.name}</span>
        </p>
        <p className="flex items-center gap-2 font-semibold">
          <TeamAvatar team={m.away} size="sm" />
          <span className="truncate">{m.away.name}</span>
        </p>
      </Link>
      <div className={`grid gap-2 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {options.map((o) => (
          <OddButton key={o.id} label={oddLabel(event, o)} odds={o.odds} selected={isSelected(o.id)} onClick={() => pick(event, o)} />
        ))}
      </div>
    </li>
  )
}

function BalanceTile() {
  const { isAuthenticated } = useAuth()
  const { summary } = useWallet()
  const settings = useAsync(() => (isAuthenticated ? Promise.resolve(null) : getSettings()), [isAuthenticated])

  if (!isAuthenticated) {
    const bonus = settings.data?.initial_balance
    return (
      <div className="col-span-2 flex flex-col justify-between gap-3 rounded-2xl bg-linear-to-br from-win/25 to-surface p-5 ring-1 ring-win/40 lg:col-span-1">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-win">
          <Gift className="h-4 w-4" aria-hidden="true" /> Bônus de boas-vindas
        </p>
        <p className="font-display text-2xl font-bold leading-tight">
          {bonus ? (
            <>
              Ganhe <span className="num text-4xl text-win">{formatCoins(bonus)}</span> ON Coins para começar
            </>
          ) : (
            'Ganhe ON Coins para começar a palpitar'
          )}
        </p>
        <Link
          to="/cadastro"
          className="flex h-11 items-center justify-center rounded-full bg-win font-display font-bold uppercase tracking-wide text-[#08170f] hover:brightness-110"
        >
          Registrar grátis
        </Link>
      </div>
    )
  }

  return (
    <Link
      to="/carteira"
      className="col-span-2 flex flex-col justify-between gap-2 rounded-2xl border border-gold/40 bg-linear-to-br from-gold/20 to-surface p-5 hover:border-gold lg:col-span-1"
    >
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gold-bright">
        <Wallet className="h-4 w-4" aria-hidden="true" /> Seu saldo
      </p>
      {summary ? (
        <Coins value={summary.balance} className="text-4xl font-bold text-text sm:text-5xl" />
      ) : (
        <span className="block h-12 w-40 animate-pulse rounded bg-raised" aria-hidden="true" />
      )}
      {summary && Number(summary.pending_stake) > 0 ? (
        <p className="text-xs text-muted">
          <Coins value={summary.pending_stake} className="text-gold-bright" /> em jogo aguardando resultado
        </p>
      ) : (
        <p className="text-xs text-muted">Nenhum palpite aguardando resultado</p>
      )}
    </Link>
  )
}

function StatTile({ icon: Icon, label, value, highlight = false }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-gold/40 bg-gold/10' : 'border-line bg-surface'}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5 text-gold" aria-hidden="true" /> {label}
      </p>
      <p className={`num mt-1 text-2xl font-bold ${highlight ? 'text-gold-bright' : 'text-text'}`}>{value}</p>
    </div>
  )
}

function UpcomingCard({ match: m, event }) {
  const body = (
    <>
      <p className="truncate text-xs text-muted">
        {m.competition?.name}
        {m.stage ? `, ${m.stage}` : ''}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <TeamAvatar team={m.home} />
        <div className="text-center">
          {m.scheduled_at ? (
            <>
              <p className="num text-lg font-bold text-gold-bright">{formatTime(m.scheduled_at)}</p>
              <p className="text-[11px] capitalize text-muted">{formatDay(m.scheduled_at)}</p>
            </>
          ) : (
            <p className="text-xs text-muted">Data a definir</p>
          )}
        </div>
        <TeamAvatar team={m.away} />
      </div>
      <p className="mt-2 flex justify-between gap-2 text-sm font-semibold">
        <span className="truncate">{m.home?.name}</span>
        <span className="truncate text-right">{m.away?.name}</span>
      </p>
      {event ? (
        <span className="mt-3 block rounded-full bg-gold py-1.5 text-center font-display text-xs font-bold uppercase tracking-wide text-on-gold">
          Apostar agora
        </span>
      ) : (
        <span className="mt-3 block rounded-full bg-raised py-1.5 text-center text-xs text-muted">Apostas ainda não abertas</span>
      )}
    </>
  )
  return (
    <li className="w-64 shrink-0 snap-start">
      {event ? (
        <Link to={`/palpites/${event.id}`} className="block h-full rounded-xl border border-line bg-surface p-4 transition-colors hover:border-gold">
          {body}
        </Link>
      ) : (
        <div className="h-full rounded-xl border border-line bg-surface p-4">{body}</div>
      )}
    </li>
  )
}

function ResultCard({ match: m }) {
  const homeWon = m.home_score > m.away_score || (m.home_score === m.away_score && hasPenalties(m) && m.home_penalties > m.away_penalties)
  const awayWon = m.away_score > m.home_score || (m.home_score === m.away_score && hasPenalties(m) && m.away_penalties > m.home_penalties)
  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="mb-2 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted">
        <span className="truncate">{m.competition?.name}</span>
        <span className="shrink-0 font-semibold text-faint">Encerrado</span>
      </p>
      {[
        [m.home, m.home_score, m.home_penalties, homeWon],
        [m.away, m.away_score, m.away_penalties, awayWon],
      ].map(([team, score, pens, won], i) => (
        <p key={i} className={`flex items-center gap-2 py-0.5 ${won ? 'font-bold text-text' : 'text-muted'}`}>
          <TeamAvatar team={team} size="sm" />
          <span className="flex-1 truncate">{team?.name}</span>
          {hasPenalties(m) && <span className="num text-xs text-faint">({pens})</span>}
          <span className={`num w-6 text-right text-lg ${won ? 'text-gold-bright' : ''}`}>{score}</span>
        </p>
      ))}
    </li>
  )
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
