import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loading } from './ui/StateViews'
import ComingSoon from './ComingSoon'

/** Exige login. Guarda a página pedida para voltar depois de entrar. */
export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading label="Verificando sua sessão…" />
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/entrar?next=${next}`} replace />
  }
  return <Outlet />
}

/**
 * Exige papel de administrador. É só conforto de interface:
 * mesmo que alguém force a rota, o banco recusa as operações (RLS).
 */
export function RequireAdmin() {
  const { isAuthenticated, isAdmin, loading, profile } = useAuth()
  const location = useLocation()
  if (loading || (isAuthenticated && !profile)) return <Loading label="Verificando permissões…" />
  if (!isAuthenticated) {
    return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (!isAdmin) {
    return (
      <ComingSoon title="Acesso restrito" phase={null}>
        Esta área é exclusiva da administração da ORG ON Camps.
      </ComingSoon>
    )
  }
  return <Outlet />
}

/** Telas de login/cadastro: quem já está logado volta para o início. */
export function GuestOnly() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <Loading label="Verificando sua sessão…" />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}
