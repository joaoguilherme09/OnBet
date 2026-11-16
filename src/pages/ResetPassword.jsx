import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import Field from '../components/ui/Field'
import Button from '../components/ui/Button'
import { Loading } from '../components/ui/StateViews'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PASSWORD_MIN, updatePassword } from '../services/authService'

/** Destino do link de recuperação: o Supabase já abriu uma sessão temporária. */
export default function ResetPassword() {
  const { isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Loading label="Validando o link…" />

  if (!isAuthenticated) {
    return (
      <AuthShell title="Link inválido ou expirado">
        <p className="mb-4 text-sm text-muted">Peça um novo link de recuperação para redefinir sua senha.</p>
        <Button as={Link} to="/recuperar-senha" className="w-full">
          Pedir novo link
        </Button>
      </AuthShell>
    )
  }

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN
  const mismatch = confirm.length > 0 && confirm !== password

  async function onSubmit(e) {
    e.preventDefault()
    if (password.length < PASSWORD_MIN || password !== confirm) return
    setError('')
    setSubmitting(true)
    try {
      await updatePassword(password)
      toast.success('Senha alterada.')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Nova senha" subtitle="Escolha a senha que você vai usar daqui pra frente.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={tooShort ? `Pelo menos ${PASSWORD_MIN} caracteres.` : undefined}
        />
        <Field
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'As senhas não conferem.' : undefined}
        />
        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full py-3"
          disabled={submitting || password.length < PASSWORD_MIN || password !== confirm}
        >
          {submitting ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthShell>
  )
}
