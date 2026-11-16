import { Link, NavLink } from 'react-router-dom'
import Logo from './Logo'
import Button from './ui/Button'
import UserMenu from './UserMenu'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import Coins from './Coins'

/**
 * Barra superior. No celular mostra a marca; no desktop fica só com as ações.
 * Logado, mostra o saldo de ON Coins (atualiza em tempo real).
 */
export default function Navbar() {
  const { isAuthenticated, loading } = useAuth()
  const { balance } = useWallet()

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="lg:invisible" aria-label="ON BETS, início">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <NavLink to="/historico" className="hidden text-sm text-muted hover:text-text sm:block lg:hidden">
              Histórico
            </NavLink>
          )}
          {isAuthenticated && balance != null && (
            <Link
              to="/carteira"
              className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-sm text-gold-bright hover:border-gold"
              aria-label="Saldo de ON Coins, abrir carteira"
            >
              <Coins value={balance} className="font-semibold" />
            </Link>
          )}
          {loading ? (
            <span className="h-9 w-28 animate-pulse rounded-lg bg-surface" aria-hidden="true" />
          ) : isAuthenticated ? (
            <UserMenu />
          ) : (
            <>
              <Button as={Link} to="/entrar" variant="ghost" className="px-3">
                Entrar
              </Button>
              <Button as={Link} to="/cadastro" className="px-4">
                Criar conta
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
