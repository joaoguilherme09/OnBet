import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import Field from '../components/ui/Field'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { signIn } from '../services/authService'

/** Só aceita caminhos internos em ?next= (evita redirecionamento para outro site). */
function safeNext(raw) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export default function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const toast = useToast()
  const { isAuthenticated, loading } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Chegou pelo link de confirmação (já com sessão) ou já estava logado.
  useEffect(() => {
    if (loading || !isAuthenticated) return
    if (params.get('confirmado')) toast.success('E-mail confirmado. Bem-vindo ao ON BETS!')
    navigate(next, { replace: true })
  }, [loading, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(form)
      toast.success('Você entrou na sua conta.')
      navigate(next, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse sua conta para registrar palpites."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="text-gold hover:text-gold-bright">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        <Field
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={set('password')}
        />
        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full py-3" disabled={submitting || !form.email || !form.password}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-center text-sm">
          <Link to="/recuperar-senha" className="text-muted hover:text-text">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
