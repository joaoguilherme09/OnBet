import { useEffect, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import Button from '../../components/ui/Button'
import ConfirmButton from '../../components/ui/ConfirmButton'
import Modal from '../../components/ui/Modal'
import Coins from '../../components/Coins'
import StatusBadge from '../../components/StatusBadge'
import { Input, Tabs } from '../../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/StateViews'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { adjustWallet, getUserActivity, listUsers, setRole } from '../../services/adminService'
import { TRANSACTION_LABEL } from '../../services/walletService'
import { newIdempotencyKey } from '../../services/supabase'
import { formatDateTime, formatOdds } from '../../utils/format'

export default function Users() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const users = useAsync(() => listUsers(query), [query])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
        <input
          aria-label="Buscar participante"
          placeholder="Buscar por username, nome ou e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-raised py-2.5 pl-9 pr-3 outline-none focus:border-gold"
        />
      </div>

      {users.loading ? (
        <SkeletonRows rows={4} />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={users.reload} />
      ) : !users.data.length ? (
        <EmptyState title="Nenhum participante encontrado." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-normal">Participante</th>
                <th className="hidden px-4 py-2 font-normal md:table-cell">E-mail</th>
                <th className="px-4 py-2 text-right font-normal">Saldo</th>
                <th className="hidden px-4 py-2 text-right font-normal sm:table-cell">Palpites</th>
                <th className="hidden px-4 py-2 font-normal lg:table-cell">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-raised" onClick={() => setSelected(u)}>
                  <td className="px-4 py-2.5">
                    <button className="flex items-center gap-1.5 text-left font-medium hover:text-gold-bright" onClick={() => setSelected(u)}>
                      {u.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-gold" aria-label="Administrador" />}
                      {u.username}
                    </button>
                  </td>
                  <td className="hidden max-w-56 truncate px-4 py-2.5 text-muted md:table-cell">{u.email}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Coins value={u.balance} />
                  </td>
                  <td className="num hidden px-4 py-2.5 text-right text-muted sm:table-cell">
                    {u.wins}/{u.predictions}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted lg:table-cell">{formatDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <UserModal
          user={selected}
          onClose={() => setSelected(null)}
          onChanged={() => users.reload()}
        />
      )}
    </div>
  )
}

function UserModal({ user, onClose, onChanged }) {
  const toast = useToast()
  const { user: me } = useAuth()
  const [tab, setTab] = useState('adjust')
  const activity = useAsync(() => getUserActivity(user.id), [user.id])
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState('credit')
  const [reason, setReason] = useState('')
  const [key, setKey] = useState(newIdempotencyKey)
  const [roleReason, setRoleReason] = useState('')
  const [role, setLocalRole] = useState(user.role)

  async function adjust() {
    const value = Math.trunc(Number(amount)) * (direction === 'debit' ? -1 : 1)
    try {
      const r = await adjustWallet(user.id, value, reason, key)
      toast.success(`Saldo ajustado. Novo saldo: ${r.balance} ON Coins.`)
      setAmount('')
      setReason('')
      setKey(newIdempotencyKey())
      activity.reload()
      onChanged()
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function changeRole() {
    const next = role === 'admin' ? 'participant' : 'admin'
    try {
      await setRole(user.id, next, roleReason)
      setLocalRole(next)
      setRoleReason('')
      toast.success(next === 'admin' ? `${user.username} agora é administrador.` : `${user.username} voltou a ser participante.`)
      onChanged()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const a = activity.data
  return (
    <Modal open onClose={onClose} title={user.username} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{user.email}</p>
            <p className="text-xs text-faint">
              {role === 'admin' ? 'Administrador' : 'Participante'}, desde {formatDateTime(user.created_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Saldo</p>
            <Coins value={a?.wallet.balance ?? user.balance} className="text-2xl font-semibold text-gold-bright" />
          </div>
        </div>

        <Tabs
          tabs={[
            { value: 'adjust', label: 'Ajustar saldo' },
            { value: 'tx', label: 'Movimentações' },
            { value: 'preds', label: 'Palpites' },
            { value: 'role', label: 'Função' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'adjust' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {[
                ['credit', 'Creditar'],
                ['debit', 'Debitar'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDirection(v)}
                  aria-pressed={direction === v}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${direction === v ? 'border-gold bg-gold/10 text-gold-bright' : 'border-line-strong text-muted'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <Input label="Quantidade de ON Coins" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
            <Input label="Justificativa (fica na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={250} />
            <ConfirmButton
              variant="primary"
              disabled={!Number(amount) || reason.trim().length < 5}
              confirmLabel={`${direction === 'credit' ? 'Creditar' : 'Debitar'} ${amount}?`}
              onConfirm={adjust}
            >
              {direction === 'credit' ? 'Creditar ON Coins' : 'Debitar ON Coins'}
            </ConfirmButton>
          </div>
        )}

        {tab === 'tx' &&
          (activity.loading ? (
            <SkeletonRows rows={3} />
          ) : activity.error ? (
            <ErrorState error={activity.error} onRetry={activity.reload} />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {a.transactions.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p>{TRANSACTION_LABEL[t.kind]}</p>
                    <p className="truncate text-xs text-muted">{t.description}</p>
                  </div>
                  <Coins value={t.type === 'credit' ? t.amount : -t.amount} signed className={t.type === 'credit' ? 'text-win' : ''} />
                  <span className="hidden text-xs text-faint sm:inline">{formatDateTime(t.created_at)}</span>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'preds' &&
          (activity.loading ? (
            <SkeletonRows rows={3} />
          ) : !a?.predictions.length ? (
            <p className="text-sm text-muted">Nenhum palpite.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {a.predictions.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {p.event?.title}: {p.option?.name} <span className="num text-muted">{formatOdds(p.odds_snapshot)}</span>
                  </span>
                  <Coins value={p.stake} />
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          ))}

        {tab === 'role' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {role === 'admin'
                ? 'Este usuário é administrador. Ao rebaixar, ele perde o acesso ao painel.'
                : 'Administradores gerenciam eventos, resultados e saldos. Promova apenas pessoas da organização.'}
            </p>
            {user.id === me?.id && role === 'admin' && (
              <p className="text-xs text-gold-bright">Você está editando a própria conta. A plataforma exige pelo menos um administrador.</p>
            )}
            <Input label="Justificativa" value={roleReason} onChange={(e) => setRoleReason(e.target.value)} />
            <ConfirmButton variant="secondary" disabled={roleReason.trim().length < 5} onConfirm={changeRole}>
              {role === 'admin' ? 'Rebaixar para participante' : 'Promover a administrador'}
            </ConfirmButton>
          </div>
        )}
      </div>
    </Modal>
  )
}
