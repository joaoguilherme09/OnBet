import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import Field from '../components/ui/Field'
import Button from '../components/ui/Button'
import { requestPasswordReset } from '../services/authService'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Enviamos um link para você criar uma nova senha."
      footer={
        <Link to="/entrar" className="text-gold hover:text-gold-bright">
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-2 text-sm">
          <p className="text-text">
            Se existir uma conta com <strong className="text-gold-bright">{email.trim()}</strong>, o link chega em
            alguns minutos.
          </p>
          <p className="text-muted">Confira também a caixa de spam. O link vale por 1 hora.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="E-mail da conta" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && (
            <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full py-3" disabled={submitting || !email.includes('@')}>
            {submitting ? 'Enviando…' : 'Enviar link'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
