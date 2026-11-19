import { NavLink } from 'react-router-dom'
import { Settings, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import { NAV_ITEMS } from './navItems'

/** Navegação lateral (desktop, a partir de lg). */
export default function Sidebar() {
  const { isAdmin, isAuthenticated } = useAuth()
  const items = isAdmin
    ? [...NAV_ITEMS, { to: '/admin', label: 'Administração', icon: ShieldCheck }]
    : NAV_ITEMS
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-ink px-4 py-6 lg:flex">
      <NavLink to="/" className="px-2" aria-label="ON BETS, início">
        <Logo variant="full" />
      </NavLink>
      <p className="mt-2 px-2 text-xs text-muted">A central de palpites da ORG ON Camps</p>

      <nav aria-label="Principal" className="mt-8 flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-surface text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded before:bg-gold'
                  : 'text-muted hover:bg-surface hover:text-text'
              }`
            }
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {isAuthenticated && (
        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            `relative mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? 'bg-surface text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded before:bg-gold'
                : 'text-muted hover:bg-surface hover:text-text'
            }`
          }
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Configurações
        </NavLink>
      )}

      <p className={`${isAuthenticated ? 'mt-4' : 'mt-auto'} px-2 text-xs leading-relaxed text-faint`}>
        ON Coins são pontos virtuais, sem valor em dinheiro. Não há depósitos, saques nem prêmios.
      </p>
    </aside>
  )
}
