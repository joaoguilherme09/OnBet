import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/admin', label: 'Painel', end: true },
  { to: '/admin/eventos', label: 'Eventos' },
  { to: '/admin/resultados', label: 'Resultados' },
  { to: '/admin/partidas', label: 'Partidas' },
  { to: '/admin/campeonatos', label: 'Campeonatos e times' },
  { to: '/admin/participantes', label: 'Participantes' },
]

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Administração</h1>
        <nav aria-label="Administração" className="flex gap-1 overflow-x-auto border-b border-line">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm ${isActive ? 'border-gold text-text' : 'border-transparent text-muted hover:text-text'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
