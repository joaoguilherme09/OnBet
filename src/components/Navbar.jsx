import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import UserMenu from './UserMenu'
import SearchDialog from './SearchDialog'
import Coins from './Coins'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'

/**
 * Barra superior em destaque, na cor principal do tema, ocupando a largura toda.
 * Logo, pesquisa, saldo e perfil; sem login, botões verdes de ENTRAR e REGISTRAR.
 */
export default function Navbar() {
  const { isAuthenticated, loading } = useAuth()
  const { balance } = useWallet()
  const [searching, setSearching] = useState(false)
  const closeSearch = useCallback(() => setSearching(false), [])

  // atalho: "/" abre a pesquisa (fora de campos de texto)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      e.preventDefault()
      setSearching(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header className="brand-bar sticky top-0 z-30 bg-linear-to-r from-gold-deep via-gold to-gold-deep text-on-gold shadow-lg shadow-black/30">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
          {/* marca */}
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="ON BETS, início">
            <img src="/assets/logo-icone.webp" alt="" width="96" height="96" className="h-11 w-11 rounded-lg ring-2 ring-on-gold/20" />
            <span className="brand-name hidden font-display text-2xl font-bold leading-none tracking-wide sm:inline">ON BETS</span>
          </Link>

          {/* pesquisa: campo no desktop, ícone no celular */}
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="ml-auto flex h-10 items-center gap-2 rounded-full bg-ink/85 px-3 text-sm text-muted transition-colors hover:bg-ink md:ml-6 md:w-full md:max-w-sm md:px-4"
            aria-label="Pesquisar times, jogos e eventos"
          >
            <Search className="h-5 w-5 text-gold-bright" aria-hidden="true" />
            <span className="hidden md:inline">Buscar time, jogo ou evento…</span>
            <kbd className="ml-auto hidden rounded border border-line-strong px-1.5 text-xs text-faint lg:inline">/</kbd>
          </button>

          <div className="flex shrink-0 items-center gap-2 md:ml-auto">
            {loading ? (
              <span className="h-10 w-32 animate-pulse rounded-full bg-ink/40" aria-hidden="true" />
            ) : isAuthenticated ? (
              <>
                {balance != null && (
                  <Link
                    to="/carteira"
                    className="flex h-10 items-center gap-2 rounded-full bg-ink/85 px-3 hover:bg-ink sm:px-4"
                    aria-label="Saldo de ON Coins, abrir carteira"
                  >
                    <span className="hidden text-xs uppercase tracking-wide text-muted sm:inline">Saldo</span>
                    <Coins value={balance} className="text-base font-bold text-gold-bright sm:text-lg" />
                  </Link>
                )}
                <UserMenu onBrand />
              </>
            ) : (
              <>
                <Link
                  to="/entrar"
                  className="flex h-10 items-center rounded-full bg-ink/85 px-3 font-display text-sm font-bold uppercase tracking-wide text-win ring-2 ring-win hover:bg-ink sm:px-5"
                >
                  Entrar
                </Link>
                <Link
                  to="/cadastro"
                  className="flex h-10 items-center rounded-full bg-win px-3 font-display text-sm font-bold uppercase tracking-wide text-[#08170f] shadow-md shadow-black/30 hover:brightness-110 sm:px-5"
                >
                  Registrar
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <SearchDialog open={searching} onClose={closeSearch} />
    </>
  )
}
