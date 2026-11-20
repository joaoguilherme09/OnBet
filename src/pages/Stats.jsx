import { useMemo, useState } from 'react'
import { Flame, Goal, Search, ShieldCheck, Swords, Target, TrendingDown, TrendingUp } from 'lucide-react'
import TeamAvatar from '../components/TeamAvatar'
import Modal from '../components/ui/Modal'
import { Select } from '../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { getStatsData } from '../services/catalogService'
import { computeTeamStats } from '../utils/teamStats'

const SORTS = [
  { value: 'wins', label: 'Mais vitórias' },
  { value: 'efficiency', label: 'Melhor aproveitamento' },
  { value: 'goals', label: 'Mais gols feitos' },
  { value: 'played', label: 'Mais jogos' },
  { value: 'name', label: 'Nome (A–Z)' },
]
const SORTERS = {
  wins: (a, b) => b.wins - a.wins || b.goalDiff - a.goalDiff,
  efficiency: (a, b) => (b.efficiency ?? -1) - (a.efficiency ?? -1) || b.played - a.played,
  goals: (a, b) => b.goalsFor - a.goalsFor,
  played: (a, b) => b.played - a.played,
  name: (a, b) => a.team.name.localeCompare(b.team.name),
}

const RESULT_STYLE = {
  W: ['V', 'bg-win text-[#08170f]', 'Vitória'],
  D: ['E', 'bg-void text-white', 'Empate'],
  L: ['D', 'bg-loss text-white', 'Derrota'],
}
const STREAK_LABEL = {
  W: ['vitória', 'vitórias seguidas'],
  D: ['empate', 'empates seguidos'],
  L: ['derrota', 'derrotas seguidas'],
}

const avg = (n) => (n == null ? '–' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))

export default function Stats() {
  const data = useAsync(() => getStatsData(), [])
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState('wins')
  const [selected, setSelected] = useState(null)

  const stats = useMemo(() => (data.data ? computeTeamStats(data.data.teams, data.data.matches) : null), [data.data])

  const list = useMemo(() => {
    if (!stats) return []
    const q = term.trim().toLowerCase()
    const all = [...stats.values()].filter((s) => !q || s.team.name.toLowerCase().includes(q))
    // quem tem jogos primeiro; dentro de cada grupo, a ordenação escolhida
    return all.sort((a, b) => (b.played > 0) - (a.played > 0) || SORTERS[sort](a, b))
  }, [stats, term, sort])

  const totals = useMemo(() => {
    const matches = data.data?.matches ?? []
    const goals = matches.reduce((n, m) => n + (m.home_score ?? 0) + (m.away_score ?? 0), 0)
    return {
      matches: matches.length,
      goals,
      avgGoals: matches.length ? goals / matches.length : null,
      penalties: matches.filter((m) => m.home_penalties != null).length,
    }
  }, [data.data])

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Estatísticas</h1>
        <p className="text-muted">Desempenho de cada time nas partidas finalizadas. Clique num time para ver tudo.</p>
      </header>

      {data.loading ? (
        <SkeletonRows rows={4} />
      ) : data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Total icon={Swords} label="Partidas finalizadas" value={totals.matches} />
            <Total icon={Goal} label="Gols marcados" value={totals.goals} />
            <Total icon={Target} label="Média de gols por jogo" value={avg(totals.avgGoals)} highlight />
            <Total icon={ShieldCheck} label="Decididas nos pênaltis" value={totals.penalties} />
          </dl>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="relative flex-1">
              <span className="sr-only">Buscar time</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar time…"
                className="h-11 w-full rounded-lg border border-line-strong bg-raised pl-9 pr-3 text-sm text-text outline-none placeholder:text-faint focus:border-gold"
              />
            </label>
            <Select aria-label="Ordenar por" className="sm:w-60" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          {!list.length ? (
            <EmptyState title={term ? 'Nenhum time com esse nome.' : 'Nenhum time cadastrado ainda.'} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((s, i) => (
                <li key={s.team.id}>
                  <TeamCard stats={s} rank={sort !== 'name' && s.played ? i + 1 : null} onOpen={() => setSelected(s)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selected && <TeamModal stats={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Total({ icon: Icon, label, value, highlight = false }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-gold/40 bg-gold/10' : 'border-line bg-surface'}`}>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5 text-gold" aria-hidden="true" /> {label}
      </dt>
      <dd className={`num mt-1 text-3xl font-bold ${highlight ? 'text-gold-bright' : ''}`}>{value}</dd>
    </div>
  )
}

function FormDots({ form, size = 'sm' }) {
  if (!form.length) return <span className="text-xs text-faint">Sem jogos</span>
  const box = size === 'lg' ? 'h-8 w-8 text-sm' : 'h-6 w-6 text-[11px]'
  return (
    <span className="flex gap-1">
      {form.map((r, i) => {
        const [letter, tone, label] = RESULT_STYLE[r]
        return (
          <span key={i} title={label} className={`${box} inline-flex items-center justify-center rounded font-bold ${tone}`}>
            {letter}
          </span>
        )
      })}
    </span>
  )
}

/** Barra de vitórias / empates / derrotas proporcional. */
function WdlBar({ s }) {
  if (!s.played) return <div className="h-2 rounded-full bg-raised" />
  const pct = (n) => `${(n / s.played) * 100}%`
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-raised" aria-hidden="true">
      <span className="bg-win" style={{ width: pct(s.wins) }} />
      <span className="bg-void" style={{ width: pct(s.draws) }} />
      <span className="bg-loss" style={{ width: pct(s.losses) }} />
    </div>
  )
}

function TeamCard({ stats: s, rank, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-lg hover:shadow-black/30"
    >
      <div className="flex items-center gap-3">
        {rank && <span className={`num w-6 text-center text-lg font-bold ${rank <= 3 ? 'text-gold-bright' : 'text-faint'}`}>{rank}</span>}
        <TeamAvatar team={s.team} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold group-hover:text-gold-bright">{s.team.name}</p>
          <p className="text-xs text-muted">{s.played ? `${s.played} ${s.played === 1 ? 'jogo' : 'jogos'}` : 'Ainda sem jogos'}</p>
        </div>
        {s.efficiency != null && (
          <div className="text-right">
            <p className="num text-xl font-bold text-gold-bright">{s.efficiency}%</p>
            <p className="text-[10px] uppercase tracking-wide text-faint">aproveit.</p>
          </div>
        )}
      </div>

      <WdlBar s={s} />

      <div className="flex items-center justify-between gap-2">
        <p className="num flex gap-3 text-sm">
          <span>
            <span className="font-bold text-win">{s.wins}</span> <span className="text-xs text-muted">V</span>
          </span>
          <span>
            <span className="font-bold text-void">{s.draws}</span> <span className="text-xs text-muted">E</span>
          </span>
          <span>
            <span className="font-bold text-loss">{s.losses}</span> <span className="text-xs text-muted">D</span>
          </span>
        </p>
        <FormDots form={s.last5} />
      </div>
    </button>
  )
}

function TeamModal({ stats: s, onClose }) {
  const sign = (n) => (n > 0 ? `+${n}` : String(n))
  return (
    <Modal open onClose={onClose} title={s.team.name} size="lg">
      {!s.played ? (
        <EmptyState title="Este time ainda não tem partidas finalizadas." />
      ) : (
        <div className="space-y-6">
          {/* cabeçalho: V / E / D grandes */}
          <div className="flex flex-wrap items-center gap-4">
            <TeamAvatar team={s.team} size="lg" />
            <div className="grid flex-1 grid-cols-3 gap-2 text-center">
              <Big label="Vitórias" value={s.wins} tone="text-win" />
              <Big label="Empates" value={s.draws} tone="text-void" />
              <Big label="Derrotas" value={s.losses} tone="text-loss" />
            </div>
          </div>

          <div className="space-y-2">
            <WdlBar s={s} />
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>
                {s.played} {s.played === 1 ? 'jogo' : 'jogos'}, aproveitamento de <span className="num font-bold text-gold-bright">{s.efficiency}%</span>
              </span>
              <span className="flex items-center gap-2">
                Últimos jogos <FormDots form={s.last5} />
              </span>
            </p>
          </div>

          {/* gols */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="Média de gols feitos" value={avg(s.avgFor)} tone="text-win" />
            <Mini label="Média de gols sofridos" value={avg(s.avgAgainst)} tone="text-loss" />
            <Mini label="Gols feitos / sofridos" value={`${s.goalsFor} / ${s.goalsAgainst}`} />
            <Mini label="Saldo de gols" value={sign(s.goalDiff)} tone={s.goalDiff > 0 ? 'text-win' : s.goalDiff < 0 ? 'text-loss' : ''} />
          </section>

          {/* rivais */}
          <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Rival
              icon={TrendingUp}
              title="Time que ele mais venceu"
              rival={s.mostBeaten}
              detail={(o) => `${o.wins} ${o.wins === 1 ? 'vitória' : 'vitórias'} em ${o.played} ${o.played === 1 ? 'jogo' : 'jogos'}`}
              tone="border-win/40 bg-win/10"
              empty="Ainda não venceu ninguém."
            />
            <Rival
              icon={TrendingDown}
              title="Time para quem ele mais perdeu"
              rival={s.mostLostTo}
              detail={(o) => `${o.losses} ${o.losses === 1 ? 'derrota' : 'derrotas'} em ${o.played} ${o.played === 1 ? 'jogo' : 'jogos'}`}
              tone="border-loss/40 bg-loss/10"
              empty="Ainda não perdeu para ninguém."
            />
          </section>

          {/* outras */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Mini
              label="Maior vitória"
              value={s.biggestWin ? `${s.biggestWin.gf} x ${s.biggestWin.ga}` : '–'}
              sub={s.biggestWin && `contra ${s.biggestWin.opponent.name}`}
              tone="text-win"
            />
            <Mini
              label="Maior derrota"
              value={s.biggestLoss ? `${s.biggestLoss.gf} x ${s.biggestLoss.ga}` : '–'}
              sub={s.biggestLoss && `contra ${s.biggestLoss.opponent.name}`}
              tone="text-loss"
            />
            <Mini
              label="Sequência atual"
              value={s.streak ? `${s.streak.count}` : '–'}
              sub={s.streak && STREAK_LABEL[s.streak.type][s.streak.count === 1 ? 0 : 1]}
              tone={s.streak ? { W: 'text-win', D: 'text-void', L: 'text-loss' }[s.streak.type] : ''}
            />
            <Mini label="Jogos sem sofrer gol" value={s.cleanSheets} />
            <Mini label="Jogos sem marcar" value={s.failedToScore} />
            <Mini
              label="Pênaltis"
              value={s.penalties.played ? `${s.penalties.won} / ${s.penalties.played}` : '–'}
              sub={s.penalties.played ? 'disputas vencidas' : 'nenhuma disputa'}
            />
          </section>

          {/* confronto direto */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 font-semibold">
              <Flame className="h-4 w-4 text-gold" aria-hidden="true" /> Confronto direto
            </h3>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-raised text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Adversário</th>
                    <th className="px-2 py-2 font-semibold" title="Jogos">J</th>
                    <th className="px-2 py-2 font-semibold text-win" title="Vitórias">V</th>
                    <th className="px-2 py-2 font-semibold" title="Empates">E</th>
                    <th className="px-2 py-2 font-semibold text-loss" title="Derrotas">D</th>
                    <th className="px-3 py-2 font-semibold" title="Gols feitos x sofridos">Gols</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {s.headToHead.map((o) => (
                    <tr key={o.team.id}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <TeamAvatar team={o.team} size="sm" />
                          <span className="truncate font-sans">{o.team.name}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">{o.played}</td>
                      <td className="px-2 py-2 text-center font-bold text-win">{o.wins}</td>
                      <td className="px-2 py-2 text-center">{o.draws}</td>
                      <td className="px-2 py-2 text-center font-bold text-loss">{o.losses}</td>
                      <td className="px-3 py-2 text-center">
                        {o.goalsFor} x {o.goalsAgainst}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-faint">
            Vitória, empate e derrota seguem o placar do jogo; disputas de pênaltis aparecem à parte.
          </p>
        </div>
      )}
    </Modal>
  )
}

function Big({ label, value, tone }) {
  return (
    <div className="rounded-xl bg-raised py-3">
      <p className={`num text-4xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
    </div>
  )
}

function Mini({ label, value, sub, tone = '' }) {
  return (
    <div className="rounded-lg border border-line bg-raised/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`num mt-0.5 text-2xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
    </div>
  )
}

function Rival({ icon: Icon, title, rival, detail, tone, empty }) {
  return (
    <div className={`rounded-lg border p-3 ${rival ? tone : 'border-line bg-raised/50'}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {title}
      </p>
      {rival ? (
        <div className="mt-2 flex items-center gap-2">
          <TeamAvatar team={rival.team} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{rival.team.name}</p>
            <p className="text-xs text-muted">{detail(rival)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </div>
  )
}
