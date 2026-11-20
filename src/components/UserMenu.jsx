import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChartColumn, ChevronDown, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/** onBrand: botão escuro, para ficar legível sobre a barra colorida. */
export default function UserMenu({ onBrand = false }) {
  const { profile, user, isAdmin, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleSignOut() {
    setOpen(false)
    try {
      await signOut()
      toast.info('Você saiu da conta.')
      navigate('/')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const name = profile?.username ?? user?.email?.split('@')[0] ?? 'Conta'
  const item = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-raised hover:text-text'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 text-sm ${
          onBrand
            ? 'h-10 rounded-full bg-ink/85 px-1.5 text-text hover:bg-ink sm:pr-3'
            : 'rounded-lg border border-line px-2.5 py-1.5 hover:border-line-strong'
        }`}
      >
        <span className="chamfer flex h-7 w-7 items-center justify-center bg-raised font-display text-xs font-semibold text-gold-bright">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-52 rounded-[var(--radius-card)] border border-line bg-surface p-1.5 shadow-xl shadow-black/50">
          <Link role="menuitem" to="/perfil" className={item} onClick={() => setOpen(false)}>
            <UserRound className="h-4 w-4" aria-hidden="true" /> Meu perfil
          </Link>
          {/* no celular/tablet não há menu lateral: Estatísticas fica aqui (no desktop já está na lateral) */}
          <Link role="menuitem" to="/estatisticas" className={`${item} lg:hidden`} onClick={() => setOpen(false)}>
            <ChartColumn className="h-4 w-4" aria-hidden="true" /> Estatísticas
          </Link>
          <Link role="menuitem" to="/configuracoes" className={item} onClick={() => setOpen(false)}>
            <Settings className="h-4 w-4" aria-hidden="true" /> Configurações
          </Link>
          {isAdmin && (
            <Link role="menuitem" to="/admin" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Painel admin
            </Link>
          )}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" onClick={handleSignOut} className={item}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
          </button>
        </div>
      )}
    </div>
  )
}
