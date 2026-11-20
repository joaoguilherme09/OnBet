import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems'

/** Barra de abas inferior (celular e tablet). */
export default function BottomNav() {
  return (
    <nav
      aria-label="Principal"
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.filter((i) => i.mobile).map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? 'text-gold-bright' : 'text-muted'}`
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
