import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AtSign, Mail } from 'lucide-react'
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
  // duas formas de entrar: pelo e-mail ou pelo nome de usuário
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('onbets-login-mode') === 'username' ? 'username' : 'email'
    } catch {
      return 'email'
    }
  })
  const [form, setForm] = useState({ login: '', password: '' })
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

  function switchMode(value) {
    setMode(value)
    setForm((f) => ({ ...f, login: '' }))
    setError('')
    try {
      localStorage.setItem('onbets-login-mode', value) // lembra a forma preferida neste aparelho
    } catch {
      /* sem armazenamento: só não lembra */
    }
  }

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
        <div className="grid grid-cols-2 rounded-lg border border-line-strong p-1" role="radiogroup" aria-label="Entrar com">
          {[
            ['email', 'E-mail', Mail],
            ['username', 'Nome de usuário', AtSign],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => switchMode(value)}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition-colors ${
                mode === value ? 'bg-gold text-on-gold' : 'text-muted hover:text-text'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {mode === 'email' ? (
          <Field
            key="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={form.login}
            onChange={set('login')}
          />
        ) : (
          <Field
            key="username"
            label="Nome de usuário"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ex.: joao_silva"
            required
            value={form.login}
            onChange={set('login')}
          />
        )}
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
        <Button type="submit" className="w-full py-3" disabled={submitting || !form.login.trim() || !form.password}>
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
