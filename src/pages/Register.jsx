import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import Field from '../components/ui/Field'
import Button from '../components/ui/Button'
import { useToast } from '../context/ToastContext'
import { PASSWORD_MIN, USERNAME_RE, isUsernameAvailable, signUp } from '../services/authService'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(f) {
  const e = {}
  if (!USERNAME_RE.test(f.username)) e.username = 'Use de 3 a 20 caracteres: letras, números, _ ou .'
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Informe um e-mail válido.'
  if (f.password.length < PASSWORD_MIN) e.password = `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Misture letras e números.'
  if (f.confirm !== f.password) e.confirm = 'As senhas não conferem.'
  return e
}

export default function Register() {
  const toast = useToast()
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [touched, setTouched] = useState({})
  const [usernameState, setUsernameState] = useState('idle') // idle | checking | free | taken
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  const errors = validate(form)

  // Checa disponibilidade do username com atraso (debounce).
  useEffect(() => {
    if (!USERNAME_RE.test(form.username)) {
      setUsernameState('idle')
      return
    }
    setUsernameState('checking')
    const t = setTimeout(async () => {
      try {
        setUsernameState((await isUsernameAvailable(form.username)) ? 'free' : 'taken')
      } catch {
        setUsernameState('idle')
      }
    }, 450)
    return () => clearTimeout(t)
  }, [form.username])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }))
  const show = (k) => (touched[k] ? errors[k] : undefined)

  async function onSubmit(e) {
    e.preventDefault()
    setTouched({ username: true, email: true, password: true, confirm: true })
    setError('')
    if (Object.keys(errors).length || usernameState === 'taken') return
    setSubmitting(true)
    try {
      const { needsConfirmation } = await signUp(form)
      if (needsConfirmation) setSentTo(form.email.trim())
      else toast.success('Conta criada. Bem-vindo ao ON BETS!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Confirme seu e-mail">
        <div className="space-y-3 text-sm">
          <MailCheck className="h-8 w-8 text-gold" aria-hidden="true" />
          <p className="text-text">
            Enviamos um link de confirmação para <strong className="text-gold-bright">{sentTo}</strong>.
          </p>
          <p className="text-muted">
            Abra o e-mail e clique no link para ativar sua conta. Se não encontrar, confira a caixa de spam.
          </p>
          <Button as={Link} to="/entrar" variant="secondary" className="w-full">
            Ir para o login
          </Button>
        </div>
      </AuthShell>
    )
  }

  const usernameHint = {
    checking: 'Verificando…',
    free: 'Disponível.',
    idle: 'É assim que você aparece no ranking.',
  }[usernameState]

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Participe dos palpites da ORG ON Camps."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="text-gold hover:text-gold-bright">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="Nome de usuário"
          autoComplete="username"
          maxLength={20}
          value={form.username}
          onChange={set('username')}
          onBlur={blur('username')}
          hint={usernameHint}
          error={usernameState === 'taken' ? 'Este nome já está em uso.' : show('username')}
        />
        <Field
          label="E-mail"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          onBlur={blur('email')}
          error={show('email')}
        />
        <Field
          label="Senha"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          onBlur={blur('password')}
          hint={`Pelo menos ${PASSWORD_MIN} caracteres, com letras e números.`}
          error={show('password')}
        />
        <Field
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          onBlur={blur('confirm')}
          error={show('confirm')}
        />
        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full py-3" disabled={submitting}>
          {submitting ? 'Criando conta…' : 'Criar conta'}
        </Button>
        <p className="text-xs leading-relaxed text-faint">
          ON Coins são pontos virtuais, sem valor em dinheiro. Não há depósitos, saques nem prêmios.
        </p>
      </form>
    </AuthShell>
  )
}
