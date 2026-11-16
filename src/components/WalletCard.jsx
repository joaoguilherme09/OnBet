import { Link } from 'react-router-dom'
import Coins from './Coins'
import Button from './ui/Button'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'

/** Resumo do saldo na home. */
export default function WalletCard() {
  const { isAuthenticated, profile } = useAuth()
  const { summary } = useWallet()

  if (!isAuthenticated) {
    return (
      <div className="card space-y-3 p-5">
        <p className="font-display text-lg font-semibold">Ganhe 1.000 ON Coins para começar</p>
        <p className="text-sm text-muted">Crie sua conta e use os pontos nos palpites dos campeonatos da ORG ON Camps.</p>
        <Button as={Link} to="/cadastro" className="w-full">
          Criar conta
        </Button>
      </div>
    )
  }

  return (
    <Link to="/carteira" className="card block space-y-3 p-5 transition-colors hover:border-line-strong">
      <p className="text-sm text-muted">Saldo de {profile?.username ?? 'você'}</p>
      {summary ? (
        <Coins value={summary.balance} className="text-4xl font-bold text-gold-bright" />
      ) : (
        <span className="block h-10 w-40 animate-pulse rounded bg-raised" aria-hidden="true" />
      )}
      {summary && Number(summary.pending_stake) > 0 && (
        <p className="text-xs text-muted">
          <Coins value={summary.pending_stake} /> em palpites aguardando resultado
        </p>
      )}
    </Link>
  )
}
