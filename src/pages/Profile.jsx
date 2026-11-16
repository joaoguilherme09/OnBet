import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Field from '../components/ui/Field'
import Button from '../components/ui/Button'
import { Loading } from '../components/ui/StateViews'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { USERNAME_RE, updateProfile } from '../services/authService'
import { formatDateTime } from '../utils/format'

export default function Profile() {
  const { profile } = useAuth()
  if (!profile) return <ProfileMissing />
  return <ProfileView key={profile.id} />
}

function ProfileMissing() {
  const { profileLoading, refreshProfile } = useAuth()
  if (profileLoading) return <Loading label="Carregando perfil…" />
  return (
    <div className="mx-auto max-w-md space-y-3 py-10 text-center">
      <p className="text-text">Não encontramos o perfil desta conta.</p>
      <Button variant="secondary" onClick={refreshProfile}>
        Tentar de novo
      </Button>
    </div>
  )
}

function ProfileView() {
  const { user, profile, setProfile, isAdmin } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ username: profile?.username ?? '', full_name: profile?.full_name ?? '' })
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
      const updated = await updateProfile(profile.id, form)
      setProfile(updated)
      toast.success('Perfil salvo.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Meu perfil</h1>
        <p className="text-muted">Seus dados de participante do ON BETS.</p>
      </header>

      <dl className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">E-mail</dt>
          <dd className="truncate">{user?.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Função</dt>
          <dd className="flex items-center gap-1.5">
            {isAdmin && <ShieldCheck className="h-4 w-4 text-gold" aria-hidden="true" />}
            {isAdmin ? 'Administrador' : 'Participante'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Membro desde</dt>
          <dd>{formatDateTime(profile.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Identificador</dt>
          <dd className="truncate font-mono text-xs text-muted">{profile.id}</dd>
        </div>
      </dl>

      <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
        <h2 className="text-lg font-semibold">Editar dados</h2>
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
        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!dirty || saving || Boolean(usernameError)}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </form>
    </div>
  )
}
