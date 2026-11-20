import { useState } from 'react'
import { Gamepad2, Moon, Sun } from 'lucide-react'
import Field from '../components/ui/Field'
import Button from '../components/ui/Button'
import { Loading } from '../components/ui/StateViews'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { PASSWORD_MIN, USERNAME_RE, changePassword, updateProfile } from '../services/authService'

export default function Settings() {
  const { profile, profileLoading } = useAuth()
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-muted">Sua conta, sua senha e a aparência do ON BETS.</p>
      </header>

      {profile ? (
        <AccountSection key={profile.id} />
      ) : profileLoading ? (
        <Loading label="Carregando perfil…" />
      ) : null}
      <PasswordSection />
      <ThemeSection />
    </div>
  )
}

function ErrorBox({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
      {children}
    </p>
  )
}

function AccountSection() {
  const { user, profile, setProfile } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ username: profile.username ?? '', full_name: profile.full_name ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = form.username !== profile.username || (form.full_name || '') !== (profile.full_name || '')
  const usernameError = USERNAME_RE.test(form.username) ? undefined : 'Use de 3 a 20 letras, números, _ ou .'

  async function onSubmit(e) {
    e.preventDefault()
    if (usernameError) return
    setError('')
    setSaving(true)
    try {
      setProfile(await updateProfile(profile.id, form))
      toast.success('Dados salvos.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
      <h2 className="text-lg font-semibold">Conta</h2>
      <Field label="E-mail" value={user?.email ?? ''} readOnly hint="O e-mail da conta não pode ser alterado aqui." />
      <Field
        label="Nome de usuário"
        maxLength={20}
        value={form.username}
        onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
        error={usernameError}
      />
      <Field
        label="Nome completo (opcional)"
        maxLength={80}
        autoComplete="name"
        value={form.full_name}
        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
      />
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" disabled={!dirty || saving || Boolean(usernameError)}>
        {saving ? 'Salvando…' : 'Salvar nome'}
      </Button>
    </form>
  )
}

function PasswordSection() {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const tooShort = form.next.length > 0 && form.next.length < PASSWORD_MIN
  const sameAsCurrent = form.next.length > 0 && form.next === form.current
  const mismatch = form.confirm.length > 0 && form.confirm !== form.next
  const valid = form.current && form.next.length >= PASSWORD_MIN && !sameAsCurrent && form.next === form.confirm

  async function onSubmit(e) {
    e.preventDefault()
    if (!valid) return
    setError('')
    setSaving(true)
    try {
      await changePassword(user.email, form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      toast.success('Senha alterada.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
      <h2 className="text-lg font-semibold">Senha</h2>
      <Field
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        value={form.current}
        onChange={set('current')}
      />
      <Field
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        value={form.next}
        onChange={set('next')}
        error={
          tooShort
            ? `Pelo menos ${PASSWORD_MIN} caracteres.`
            : sameAsCurrent
              ? 'A nova senha precisa ser diferente da atual.'
              : undefined
        }
      />
      <Field
        label="Confirmar nova senha"
        type="password"
        autoComplete="new-password"
        value={form.confirm}
        onChange={set('confirm')}
        error={mismatch ? 'As senhas não conferem.' : undefined}
      />
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" disabled={!valid || saving}>
        {saving ? 'Verificando…' : 'Alterar senha'}
      </Button>
    </form>
  )
}

const THEMES = [
  { value: 'dark', label: 'Escuro', desc: 'Grafite e dourado', icon: Moon, swatch: ['#141518', '#1c1e22', '#d6a93f'] },
  { value: 'light', label: 'Claro', desc: 'Branco e dourado', icon: Sun, swatch: ['#faf7f0', '#ffffff', '#c8962b'] },
  { value: 'efootball', label: 'eFootball', desc: 'Rosa, roxo e azul', icon: Gamepad2, swatch: ['#18123a', '#ff3d9a', '#3a8bff'] },
]

function ThemeSection() {
  const { theme, setTheme } = useTheme()
  return (
    <section className="card space-y-4 p-5" aria-labelledby="tema-titulo">
      <h2 id="tema-titulo" className="text-lg font-semibold">Tema</h2>
      <div role="radiogroup" aria-labelledby="tema-titulo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map(({ value, label, desc, icon: Icon, swatch }) => {
          const active = theme === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={`flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors ${
                active ? 'border-gold bg-gold/5' : 'border-line-strong hover:border-gold/60'
              }`}
            >
              <span className="flex h-12 overflow-hidden rounded-md border border-line" aria-hidden="true">
                {swatch.map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="flex items-center gap-2 text-sm font-medium text-text">
                <Icon className={`h-4 w-4 ${active ? 'text-gold' : 'text-muted'}`} aria-hidden="true" />
                {label}
              </span>
              <span className="text-xs text-muted">{desc}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
