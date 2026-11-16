import { useState } from 'react'
import Button from '../../components/ui/Button'
import ConfirmButton from '../../components/ui/ConfirmButton'
import Coins from '../../components/Coins'
import StatusBadge from '../../components/StatusBadge'
import { Input } from '../../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/StateViews'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { getEventSummary, listEventsAdmin, settleEvent, voidEvent } from '../../services/adminService'
import { eventDisplayStatus } from '../../services/predictionService'
import { CATEGORY_LABEL, formatCoins, formatDateTime, formatOdds } from '../../utils/format'

export default function Results() {
  const open = useAsync(() => listEventsAdmin({ status: 'open' }), [])
  const closed = useAsync(() => listEventsAdmin({ status: 'closed' }), [])
  const [showOpen, setShowOpen] = useState(false)
  const reload = () => {
    open.reload()
    closed.reload()
  }

  if (open.loading || closed.loading) return <SkeletonRows rows={3} />
  if (open.error || closed.error) return <ErrorState error={open.error || closed.error} onRetry={reload} />

  const now = Date.now()
  const pending = [...closed.data, ...open.data.filter((e) => new Date(e.closes_at).getTime() <= now)].sort(
    (a, b) => new Date(a.closes_at) - new Date(b.closes_at),
  )
  const stillOpen = open.data.filter((e) => new Date(e.closes_at).getTime() > now)

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        A apuração acontece uma única vez: o banco marca vencedores e perdedores e credita stake × odd registrada. Anular devolve o valor
        usado, sem multiplicador.
      </p>
      {!pending.length ? (
        <EmptyState title="Nenhum evento aguardando resultado." />
      ) : (
        <div className="space-y-4">
          {pending.map((e) => (
            <SettleCard key={e.id} event={e} onDone={reload} />
          ))}
        </div>
      )}

      {stillOpen.length > 0 && (
        <section className="space-y-3">
          <Button variant="ghost" onClick={() => setShowOpen((s) => !s)}>
            {showOpen ? 'Ocultar' : 'Mostrar'} {stillOpen.length} {stillOpen.length === 1 ? 'evento ainda aberto' : 'eventos ainda abertos'}
          </Button>
          {showOpen && stillOpen.map((e) => <SettleCard key={e.id} event={e} onDone={reload} />)}
        </section>
      )}
    </div>
  )
}

/** Sugere a opção vencedora a partir do placar (partidas 1X2). */
function suggestFromScore(event) {
  const m = event.match
  if (!m || m.status !== 'finished' || m.home_score == null) return null
  const opts = event.options ?? []
  if (m.home_score === m.away_score) return opts.find((o) => !o.team_id && /empate/i.test(o.name))?.id ?? null
  const winnerTeam = m.home_score > m.away_score ? m.home?.id : m.away?.id
  return opts.find((o) => o.team_id === winnerTeam)?.id ?? null
}

function SettleCard({ event, onDone }) {
  const toast = useToast()
  const summary = useAsync(() => getEventSummary(event.id), [event.id])
  const suggested = suggestFromScore(event)
  const [winner, setWinner] = useState(suggested ?? '')
  const [reason, setReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  const rows = summary.data ?? []
  const totalStake = rows.reduce((a, r) => a + Number(r.total_stake), 0)
  const totalPreds = rows.reduce((a, r) => a + Number(r.predictions), 0)
  const chosen = rows.find((r) => r.option_id === winner)

  async function settle() {
    try {
      const r = await settleEvent(event.id, winner)
      toast.success(`Evento apurado: ${r.winners} acerto(s), ${formatCoins(r.total_paid)} ON Coins creditados.`)
      onDone()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function doVoid() {
    try {
      const r = await voidEvent(event.id, reason)
      toast.success(`Evento anulado: ${r.refunded} palpite(s) devolvido(s).`)
      onDone()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <article className="card space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{event.title}</h3>
          <p className="text-xs text-muted">
            {CATEGORY_LABEL[event.category]}, prazo {formatDateTime(event.closes_at)}, {totalPreds} {totalPreds === 1 ? 'palpite' : 'palpites'},{' '}
            {formatCoins(totalStake)} ON Coins em jogo
          </p>
          {event.match?.status === 'finished' && (
            <p className="text-xs text-gold-bright">
              Placar registrado: {event.match.home?.name} {event.match.home_score} x {event.match.away_score} {event.match.away?.name}
            </p>
          )}
        </div>
        <StatusBadge status={eventDisplayStatus(event)} />
      </header>

      {summary.loading ? (
        <SkeletonRows rows={1} />
      ) : (
        <fieldset className="space-y-2">
          <legend className="sr-only">Opção vencedora</legend>
          {rows.map((r) => (
            <label
              key={r.option_id}
              className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-gold has-checked:bg-gold/5"
            >
              <input type="radio" name={`win-${event.id}`} className="accent-[var(--color-gold)]" checked={winner === r.option_id} onChange={() => setWinner(r.option_id)} />
              <span className="flex-1">
                {r.name} <span className="num text-muted">{formatOdds(r.odds)}</span>
                {suggested === r.option_id && <span className="ml-2 text-xs text-gold-bright">sugerido pelo placar</span>}
              </span>
              <span className="text-xs text-muted">
                {r.predictions} palpite(s), <Coins value={r.total_stake} />
              </span>
              <span className="text-xs text-muted">
                paga <Coins value={r.potential_payout} />
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ConfirmButton
          variant="primary"
          disabled={!winner}
          confirmLabel={chosen ? `Confirmar ${chosen.name}?` : 'Confirmar?'}
          onConfirm={settle}
        >
          Apurar resultado
        </ConfirmButton>
        <Button variant="ghost" onClick={() => setVoiding((v) => !v)}>
          Anular evento
        </Button>
      </div>

      {voiding && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
          <Input
            label="Motivo da anulação"
            className="min-w-56 flex-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: partida cancelada por W.O. duplo"
          />
          <ConfirmButton variant="secondary" disabled={reason.trim().length < 5} confirmLabel="Anular e devolver?" onConfirm={doVoid}>
            Anular e devolver pontos
          </ConfirmButton>
        </div>
      )}
    </article>
  )
}
