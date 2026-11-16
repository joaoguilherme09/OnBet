import { Link } from 'react-router-dom'
import Coins from './Coins'
import { useAuth } from '../context/AuthContext'

export const MEDAL = ['text-gold-bright', 'text-silver', 'text-bronze']

/** Top N compacto (home). */
export default function RankingCard({ rows }) {
  const { user } = useAuth()
  return (
    <ol className="card divide-y divide-line">
      {rows.map((r) => {
        const pos = Number(r.position)
        return (
          <li key={r.user_id} className={`flex items-center gap-3 px-4 py-2.5 ${r.user_id === user?.id ? 'bg-gold/5' : ''}`}>
            <span className={`num w-6 text-center font-semibold ${MEDAL[pos - 1] ?? 'text-faint'}`}>{pos}</span>
            <span className="flex-1 truncate">{r.username}</span>
            <Coins value={r.balance} className="text-sm" />
          </li>
        )
      })}
      <li>
        <Link to="/ranking" className="block px-4 py-2.5 text-center text-sm text-muted hover:text-text">
          Ver ranking completo
        </Link>
      </li>
    </ol>
  )
}
