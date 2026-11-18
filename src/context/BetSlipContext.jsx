import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Coins from '../components/Coins'
import { useAuth } from './AuthContext'
import { useWallet } from './WalletContext'
import { useToast } from './ToastContext'
import { getSettings, isEventOpen, placePrediction } from '../services/predictionService'
import { newIdempotencyKey } from '../services/supabase'
import { formatCoins, formatOdds, potentialPayout } from '../utils/format'

const BetSlipContext = createContext(null)

/**
 * Cupom de palpite global: qualquer card chama pick(event, option).
 * O valor e a odd exibidos são só prévia: o banco recalcula e valida tudo.
 */
export function BetSlipProvider({ children }) {
  const [slip, setSlip] = useState(null) // { event, option, key }
  const [placedCount, setPlacedCount] = useState(0)

  const pick = useCallback((event, option) => setSlip({ event, option, key: newIdempotencyKey() }), [])
  const close = useCallback(() => setSlip(null), [])

  const value = useMemo(() => ({ pick, selectedOptionId: slip?.option.id, placedCount }), [pick, slip, placedCount])

  return (
    <BetSlipContext.Provider value={value}>
      {children}
      {slip && (
        <BetSlip
          slip={slip}
          onClose={close}
          onPlaced={() => {
            setPlacedCount((n) => n + 1)
            close()
          }}
        />
      )}
    </BetSlipContext.Provider>
  )
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext)
  if (!ctx) throw new Error('useBetSlip precisa estar dentro de <BetSlipProvider>')
  return ctx
}

function BetSlip({ slip, onClose, onPlaced }) {
  const { event, option, key } = slip
  const { isAuthenticated } = useAuth()
  const { balance, refresh } = useWallet()
  const toast = useToast()
  const location = useLocation()
  const [settings, setSettings] = useState(null)
  const [stake, setStake] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getSettings().then(setSettings).catch(() => setSettings({ min_stake: 1, max_stake: Infinity }))
  }, [])

  const amount = Math.trunc(Number(stake) || 0)
  const min = settings?.min_stake ?? 1
  const max = Math.min(settings?.max_stake ?? Infinity, balance ?? Infinity)
  const open = isEventOpen(event)

  let problem = ''
  if (!open) problem = 'Este evento não aceita mais palpites.'
  else if (amount && amount < min) problem = `O mínimo é ${formatCoins(min)} ON Coins.`
  else if (amount && settings && amount > settings.max_stake) problem = `O máximo por palpite é ${formatCoins(settings.max_stake)} ON Coins.`
  else if (amount && balance != null && amount > balance) problem = 'Saldo insuficiente.'

  const chips = [10, 50, 100, 250].filter((v) => v >= min && v <= max)

  async function confirm() {
    setError('')
    setSubmitting(true)
    try {
      await placePrediction({ optionId: option.id, stake: amount, idempotencyKey: key })
      toast.success(`Palpite registrado: ${formatCoins(amount)} ON Coins em ${option.name} (${formatOdds(option.odds)}).`)
      await refresh()
      onPlaced()
    } catch (err) {
      setError(err.message)
      refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Cupom de palpite" size="sm">
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="text-xs text-muted">{event.title}</p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-lg font-semibold">{option.name}</p>
            <span className="chamfer num bg-gold px-3 py-1 text-lg font-bold text-on-gold">{formatOdds(option.odds)}</span>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Entre na sua conta para registrar palpites com seus ON Coins.</p>
            <div className="flex gap-2">
              <Button as={Link} to={`/entrar?next=${encodeURIComponent(location.pathname)}`} className="flex-1" onClick={onClose}>
                Entrar
              </Button>
              <Button as={Link} to="/cadastro" variant="secondary" className="flex-1" onClick={onClose}>
                Criar conta
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor="stake" className="text-sm">
                  Quanto você quer usar?
                </label>
                <span className="text-xs text-muted">
                  Saldo: <Coins value={balance ?? 0} />
                </span>
              </div>
              <input
                id="stake"
                inputMode="numeric"
                autoComplete="off"
                value={stake}
                onChange={(e) => setStake(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder={`Mínimo ${formatCoins(min)}`}
                className="num w-full rounded-lg border border-line-strong bg-raised px-3 py-3 text-2xl text-text outline-none placeholder:text-base placeholder:text-faint focus:border-gold"
              />
              <div className="flex flex-wrap gap-2">
                {chips.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStake(String(v))}
                    className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted hover:border-gold hover:text-text"
                  >
                    {v}
                  </button>
                ))}
                {Number.isFinite(max) && max >= min && (
                  <button
                    type="button"
                    onClick={() => setStake(String(max))}
                    className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted hover:border-gold hover:text-text"
                  >
                    Máximo
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-raised px-4 py-3">
              <span className="text-sm text-muted">Retorno se acertar</span>
              <Coins value={amount ? potentialPayout(amount, option.odds) : 0} className="text-xl font-semibold text-gold-bright" />
            </div>

            {(problem || error) && (
              <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
                {error || problem}
              </p>
            )}

            <Button className="w-full py-3 text-base" disabled={!amount || Boolean(problem) || submitting} onClick={confirm}>
              {submitting ? 'Registrando…' : 'Confirmar palpite'}
            </Button>
            <p className="text-xs leading-relaxed text-faint">
              Depois de confirmado, o palpite não pode ser alterado ou cancelado. A odd fica registrada no valor atual.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
