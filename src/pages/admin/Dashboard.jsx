import { useEffect, useState } from 'react'
import Coins from '../../components/Coins'
import Button from '../../components/ui/Button'
import { Input } from '../../components/ui/Inputs'
import { ErrorState, SkeletonRows } from '../../components/ui/StateViews'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { getAuditLog, getDashboardStats, getSettings, updateSettings } from '../../services/adminService'
import { EVENT_STATUS_LABEL, MATCH_STATUS_LABEL, formatCoins, formatDateTime } from '../../utils/format'

const ROLE_LABEL = { admin: 'administrador', participant: 'participante' }
const OPTION_STATUS_LABEL = { active: 'ativa', inactive: 'inativa' }
const lower = (map, v) => (map[v] ?? v ?? '').toString().toLowerCase()

const ACTION_LABEL = {
  'event.settle': 'Apurou evento',
  'event.void': 'Anulou evento',
  'event.update': 'Alterou evento',
  'option.odds': 'Alterou odd',
  'option.status': 'Alterou opção',
  'match.update': 'Alterou partida',
  'wallet.adjust': 'Ajustou saldo',
  'settings.update': 'Alterou configurações',
  'profile.role': 'Alterou função',
}

function describe(a) {
  const d = a.details ?? {}
  switch (a.action) {
    case 'event.settle':
      return `${d.winning_option} venceu: ${d.winners} acerto(s), ${formatCoins(d.total_paid)} pagos`
    case 'event.void':
      return `${d.refunded} palpite(s) devolvido(s)`
    case 'option.odds':
      return `${d.name}: ${String(d.before).replace('.', ',')} → ${String(d.after).replace('.', ',')}`
    case 'wallet.adjust':
      return `${d.amount > 0 ? '+' : ''}${formatCoins(d.amount)} (saldo ${formatCoins(d.balance_before)} → ${formatCoins(d.balance_after)})`
    case 'event.update':
      return d.status?.before === d.status?.after
        ? `${d.title}: novo prazo ${formatDateTime(d.closes_at?.after)}`
        : `${d.title}: ${lower(EVENT_STATUS_LABEL, d.status?.before)} → ${lower(EVENT_STATUS_LABEL, d.status?.after)}`
    case 'match.update':
      return `${lower(MATCH_STATUS_LABEL, d.status?.before)} → ${lower(MATCH_STATUS_LABEL, d.status?.after)}${d.score?.after && d.score.after !== 'x' ? `, placar ${d.score.after}` : ''}`
    case 'profile.role':
      return `${lower(ROLE_LABEL, d.before)} → ${lower(ROLE_LABEL, d.after)}`
    case 'option.status':
      return `${d.name}: ${lower(OPTION_STATUS_LABEL, d.before)} → ${lower(OPTION_STATUS_LABEL, d.after)}`
    default:
      return ''
  }
}

export default function Dashboard() {
  const stats = useAsync(() => getDashboardStats(), [])
  const audit = useAsync(() => getAuditLog(25), [])
  const s = stats.data

  const cards = s
    ? [
        ['Participantes', s.participants],
        ['Eventos abertos', s.events_open],
        ['Aguardando apuração', s.events_closed],
        ['Eventos apurados', s.events_settled],
        ['Eventos cadastrados', s.events_total],
        ['Palpites registrados', s.predictions],
        ['ON Coins usados em palpites', <Coins key="a" value={s.coins_staked} />],
        ['ON Coins nas carteiras', <Coins key="b" value={s.coins_in_wallets} />],
      ]
    : []

  return (
    <div className="space-y-8">
      {stats.loading ? (
        <SkeletonRows rows={2} />
      ) : stats.error ? (
        <ErrorState error={stats.error} onRetry={stats.reload} />
      ) : (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="card px-4 py-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="num text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Atividade recente</h2>
          {audit.loading ? (
            <SkeletonRows rows={4} />
          ) : audit.error ? (
            <ErrorState error={audit.error} onRetry={audit.reload} />
          ) : !audit.data.length ? (
            <p className="text-sm text-muted">Nenhuma ação administrativa registrada ainda.</p>
          ) : (
            <ul className="card divide-y divide-line">
              {audit.data.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <p>
                    <span className="text-gold-bright">{a.admin?.username ?? 'sistema'}</span> {ACTION_LABEL[a.action] ?? a.action}
                    <span className="text-muted"> {describe(a)}</span>
                  </p>
                  {a.reason && <p className="text-xs text-muted">Justificativa: {a.reason}</p>}
                  <p className="text-xs text-faint">{formatDateTime(a.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <SettingsForm onSaved={() => audit.reload()} />
      </div>
    </div>
  )
}

function SettingsForm({ onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings()
      .then((s) => setForm({ initial_balance: s.initial_balance, min_stake: s.min_stake, max_stake: s.max_stake }))
      .catch((e) => toast.error(e.message))
  }, [toast])

  if (!form) return <SkeletonRows rows={1} />
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, '') }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateSettings(form)
      toast.success('Configurações salvas.')
      onSaved?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="card h-fit space-y-4 p-5">
      <h2 className="text-lg font-semibold">Configurações</h2>
      <Input label="Saldo inicial de novos participantes" inputMode="numeric" value={form.initial_balance} onChange={set('initial_balance')} hint="Vale para quem se cadastrar daqui em diante." />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Palpite mínimo" inputMode="numeric" value={form.min_stake} onChange={set('min_stake')} />
        <Input label="Palpite máximo" inputMode="numeric" value={form.max_stake} onChange={set('max_stake')} />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar configurações'}
      </Button>
    </form>
  )
}
