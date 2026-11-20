import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Layers, X } from 'lucide-react'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Coins from '../components/Coins'
import { useAuth } from './AuthContext'
import { useWallet } from './WalletContext'
import { useToast } from './ToastContext'
import { getSettings, isEventOpen, placeParlay, placePrediction } from '../services/predictionService'
import { newIdempotencyKey } from '../services/supabase'
import { combinedOdds, formatCoins, formatOdds, potentialPayout } from '../utils/format'

const BetSlipContext = createContext(null)
export const MAX_PARLAY_LEGS = 10

/**
 * Cupom de palpite global: qualquer card chama pick(event, option).
 * Um palpite = aposta simples. Dois ou mais = múltipla (odds multiplicam,
 * e se um errar perde tudo). Só um palpite por evento: escolher outra opção
 * do mesmo evento troca a anterior.
 * O valor e a odd exibidos são só prévia: o banco recalcula e valida tudo.
 */
export function BetSlipProvider({ children }) {
  const [selections, setSelections] = useState([]) // [{ event, option }]
  const [open, setOpen] = useState(false)
  const [placedCount, setPlacedCount] = useState(0)

  const pick = useCallback((event, option) => {
    setSelections((list) => {
      if (list.some((s) => s.option.id === option.id)) return list
      const sameEvent = list.findIndex((s) => s.event.id === event.id)
      if (sameEvent >= 0) return list.map((s, i) => (i === sameEvent ? { event, option } : s))
      if (list.length >= MAX_PARLAY_LEGS) return list
      return [...list, { event, option }]
    })
    setOpen(true)
  }, [])
  const remove = useCallback((optionId) => setSelections((list) => list.filter((s) => s.option.id !== optionId)), [])
  const clear = useCallback(() => {
    setSelections([])
    setOpen(false)
  }, [])

  const selectedIds = useMemo(() => new Set(selections.map((s) => s.option.id)), [selections])
  const isSelected = useCallback((optionId) => selectedIds.has(optionId), [selectedIds])

  const value = useMemo(() => ({ pick, isSelected, count: selections.length, placedCount }), [pick, isSelected, selections.length, placedCount])

  useEffect(() => {
    if (!selections.length) setOpen(false)
  }, [selections.length])

  return (
    <BetSlipContext.Provider value={value}>
      {children}
      {selections.length > 0 && !open && <SlipBar selections={selections} onOpen={() => setOpen(true)} />}
      {open && selections.length > 0 && (
        <BetSlip
          selections={selections}
          onRemove={remove}
          onClear={clear}
          onClose={() => setOpen(false)}
          onPlaced={() => {
            setPlacedCount((n) => n + 1)
            clear()
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

/** Atalho flutuante para reabrir o cupom enquanto o usuário escolhe outros jogos. */
function SlipBar({ selections, onOpen }) {
  const n = selections.length
  const odds = combinedOdds(selections.map((s) => s.option.odds))
  return (
    <button
      type="button"
      onClick={onOpen}
      className="chamfer fixed bottom-20 right-4 z-30 flex items-center gap-3 bg-gold px-4 py-3 text-on-gold shadow-2xl lg:bottom-6 lg:right-6"
    >
      <Layers className="h-5 w-5" aria-hidden="true" />
      <span className="text-sm font-semibold">
        {n === 1 ? 'Cupom: 1 palpite' : `Múltipla: ${n} palpites`}
      </span>
      <span className="num text-lg font-bold">{formatOdds(odds)}</span>
    </button>
  )
}

function BetSlip({ selections, onRemove, onClear, onClose, onPlaced }) {
  const { isAuthenticated } = useAuth()
  const { balance, refresh } = useWallet()
  const toast = useToast()
  const location = useLocation()
  const [settings, setSettings] = useState(null)
  const [stake, setStake] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isParlay = selections.length > 1
  const signature = selections.map((s) => s.option.id).join(',')
  // nova combinação = nova chave de idempotência (o mesmo cupom reenviado reaproveita a chave)
  const key = useMemo(() => newIdempotencyKey(), [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSettings().then(setSettings).catch(() => setSettings({ min_stake: 1, max_stake: Infinity }))
  }, [])

  useEffect(() => setError(''), [signature])

  const odds = combinedOdds(selections.map((s) => s.option.odds))
  const amount = Math.trunc(Number(stake) || 0)
  const min = settings?.min_stake ?? 1
  const max = Math.min(settings?.max_stake ?? Infinity, balance ?? Infinity)
  const closed = selections.filter((s) => !isEventOpen(s.event))

  // apostas da mesma partida são correlacionadas: na múltipla, só uma por partida (o banco confere de novo)
  const matchCount = {}
  for (const s of selections) if (s.event.match_id) matchCount[s.event.match_id] = (matchCount[s.event.match_id] ?? 0) + 1
  const sameMatch = isParlay ? selections.filter((s) => matchCount[s.event.match_id] > 1) : []

  let problem = ''
  if (closed.length) problem = closed.length === 1 ? `"${closed[0].event.title}" não aceita mais palpites. Remova do cupom.` : 'Alguns eventos não aceitam mais palpites. Remova do cupom.'
  else if (sameMatch.length)
    problem =
      'Não dá para juntar duas apostas da mesma partida numa múltipla: uma depende da outra (ex.: quem vence e quem se classifica). Remova uma delas e, se quiser, faça como aposta simples.'
  else if (amount && amount < min) problem = `O mínimo é ${formatCoins(min)} ON Coins.`
  else if (amount && settings && amount > settings.max_stake) problem = `O máximo por palpite é ${formatCoins(settings.max_stake)} ON Coins.`
  else if (amount && balance != null && amount > balance) problem = 'Saldo insuficiente.'

  const chips = [10, 50, 100, 250].filter((v) => v >= min && v <= max)

  async function confirm() {
    setError('')
    setSubmitting(true)
    try {
      if (isParlay) {
        await placeParlay({ optionIds: selections.map((s) => s.option.id), stake: amount, idempotencyKey: key })
        toast.success(`Múltipla registrada: ${formatCoins(amount)} ON Coins em ${selections.length} palpites (${formatOdds(odds)}).`)
      } else {
        const { option } = selections[0]
        await placePrediction({ optionId: option.id, stake: amount, idempotencyKey: key })
        toast.success(`Palpite registrado: ${formatCoins(amount)} ON Coins em ${option.name} (${formatOdds(option.odds)}).`)
      }
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
    <Modal open onClose={onClose} title={isParlay ? `Múltipla (${selections.length} palpites)` : 'Cupom de palpite'} size="sm">
      <div className="space-y-5">
        <ul className="space-y-2">
          {selections.map(({ event, option }) => (
            <li
              key={option.id}
              className={`flex items-start gap-3 ${sameMatch.some((s) => s.option.id === option.id) ? '-mx-2 rounded-lg bg-loss/10 px-2 py-1 ring-1 ring-loss/40' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted">{event.title}</p>
                <p className="font-display font-semibold">{option.name}</p>
                {sameMatch.some((s) => s.option.id === option.id) && (
                  <p className="text-[11px] font-semibold text-loss">Mesma partida de outro palpite do cupom</p>
                )}
              </div>
              <span className="chamfer num bg-raised px-2.5 py-1 font-semibold text-gold-bright">{formatOdds(option.odds)}</span>
              <button
                type="button"
                onClick={() => onRemove(option.id)}
                className="mt-1 text-muted hover:text-text"
                aria-label={`Remover ${option.name} do cupom`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {isParlay && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Odd total</span>
              <span className="chamfer num bg-gold px-3 py-1 text-lg font-bold text-on-gold">{formatOdds(odds)}</span>
            </div>
            <p className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-xs leading-relaxed text-text">
              Todos os palpites precisam acertar. Se um errar, você perde a múltipla inteira.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {selections.length < MAX_PARLAY_LEGS && (
            <button type="button" onClick={onClose} className="text-gold-bright hover:underline">
              + Adicionar outro jogo {isParlay ? '' : '(múltipla)'}
            </button>
          )}
          {isParlay && (
            <button type="button" onClick={onClear} className="text-muted hover:text-text">
              Limpar cupom
            </button>
          )}
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
              <span className="text-sm text-muted">{isParlay ? 'Retorno se acertar todos' : 'Retorno se acertar'}</span>
              <Coins value={amount ? potentialPayout(amount, odds) : 0} className="text-xl font-semibold text-gold-bright" />
            </div>

            {(problem || error) && (
              <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-sm text-text">
                {error || problem}
              </p>
            )}

            <Button className="w-full py-3 text-base" disabled={!amount || Boolean(problem) || submitting} onClick={confirm}>
              {submitting ? 'Registrando…' : isParlay ? 'Confirmar múltipla' : 'Confirmar palpite'}
            </Button>
            <p className="text-xs leading-relaxed text-faint">
              Depois de confirmado, o palpite não pode ser alterado ou cancelado. A odd fica registrada no valor atual.
              {isParlay && ' Se um evento da múltipla for anulado, ele sai da conta (vale odd 1,00).'}
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
