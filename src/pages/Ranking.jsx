import Coins from '../components/Coins'
import { MEDAL } from '../components/RankingCard'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../context/AuthContext'
import { getMyRank, getRanking } from '../services/rankingService'

const PODIUM_STYLE = [
  'border-gold/60 bg-gold/10 sm:order-2 sm:pb-10',
  'border-silver/50 bg-silver/5 sm:order-1 sm:mt-8',
  'border-bronze/50 bg-bronze/5 sm:order-3 sm:mt-12',
]

export default function Ranking() {
  const { user, isAuthenticated } = useAuth()
  const ranking = useAsync(() => getRanking(100), [])
  const me = useAsync(() => (isAuthenticated ? getMyRank() : Promise.resolve(null)), [isAuthenticated])

  const rows = ranking.data ?? []
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Ranking</h1>
          <p className="text-muted">Classificação pelo saldo de ON Coins.</p>
        </div>
        {me.data && (
          <p className="text-sm text-muted">
            Você está em <span className="num text-lg font-semibold text-gold-bright">{me.data.position}º</span> de {me.data.total}
          </p>
        )}
      </header>

      {ranking.loading ? (
        <SkeletonRows rows={5} />
      ) : ranking.error ? (
        <ErrorState error={ranking.error} onRetry={ranking.reload} />
      ) : !rows.length ? (
        <EmptyState title="Ninguém no ranking ainda." />
      ) : (
        <>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-start">
            {podium.map((r, i) => (
              <li
                key={r.user_id}
                className={`flex flex-col items-center gap-1 rounded-[var(--radius-card)] border px-4 pb-5 pt-4 text-center ${PODIUM_STYLE[i]}`}
              >
                <span className={`num text-4xl font-bold ${MEDAL[Number(r.position) - 1] ?? 'text-faint'}`}>{r.position}º</span>
                <span className={`max-w-full truncate font-display text-lg font-semibold ${r.user_id === user?.id ? 'text-gold-bright' : ''}`}>
                  {r.username}
                </span>
                <Coins value={r.balance} className="text-xl" />
                <span className="text-xs text-muted">
                  {r.wins} de {r.predictions} {Number(r.predictions) === 1 ? 'palpite certo' : 'palpites certos'}
                </span>
              </li>
            ))}
          </ol>

          {rest.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2 font-normal">Posição</th>
                    <th className="px-4 py-2 font-normal">Participante</th>
                    <th className="px-4 py-2 text-right font-normal">Saldo</th>
                    <th className="hidden px-4 py-2 text-right font-normal sm:table-cell">Palpites</th>
                    <th className="hidden px-4 py-2 text-right font-normal sm:table-cell">Acertos</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((r) => (
                    <tr key={r.user_id} className={`border-b border-line last:border-0 ${r.user_id === user?.id ? 'bg-gold/5' : ''}`}>
                      <td className="num px-4 py-2.5 text-muted">{r.position}º</td>
                      <td className="max-w-40 truncate px-4 py-2.5">{r.username}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Coins value={r.balance} />
                      </td>
                      <td className="num hidden px-4 py-2.5 text-right text-muted sm:table-cell">{r.predictions}</td>
                      <td className="num hidden px-4 py-2.5 text-right text-muted sm:table-cell">{r.wins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
