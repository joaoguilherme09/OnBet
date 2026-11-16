import { useEffect, useState } from 'react'
import Coins from '../components/Coins'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useWallet } from '../context/WalletContext'
import { TRANSACTION_LABEL, getTransactions } from '../services/walletService'
import { formatDateTime } from '../utils/format'

const PAGE = 20

export default function Wallet() {
  const { summary, refresh } = useWallet()
  const [rows, setRows] = useState([])
  const [state, setState] = useState({ loading: true, error: null, done: false })

  async function load(before) {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const page = await getTransactions({ limit: PAGE, before })
      setRows((r) => (before ? [...r, ...page] : page))
      setState({ loading: false, error: null, done: page.length < PAGE })
    } catch (error) {
      setState({ loading: false, error, done: false })
    }
  }

  useEffect(() => {
    refresh()
    load()
  }, [summary?.balance]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = [
    ['Total recebido', summary?.total_received],
    ['Usado em palpites', summary?.total_staked],
    ['Retornos e devoluções', summary?.total_returned],
    ['Aguardando resultado', summary?.pending_stake],
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Carteira</h1>
        <p className="text-muted">ON Coins são pontos virtuais, sem valor em dinheiro.</p>
      </header>

      <section className="card p-6">
        <p className="text-sm text-muted">Saldo atual</p>
        {summary ? (
          <Coins value={summary.balance} className="text-5xl font-bold text-gold-bright" />
        ) : (
          <span className="mt-2 block h-12 w-48 animate-pulse rounded bg-raised" aria-hidden="true" />
        )}
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-lg">
                <Coins value={v ?? 0} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Movimentações</h2>
        {state.error ? (
          <ErrorState error={state.error} onRetry={() => load()} />
        ) : !rows.length && state.loading ? (
          <SkeletonRows rows={4} />
        ) : !rows.length ? (
          <EmptyState title="Nenhuma movimentação ainda." />
        ) : (
          <ul className="card divide-y divide-line">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{TRANSACTION_LABEL[t.kind]}</p>
                  <p className="truncate text-xs text-muted">{t.description}</p>
                  <p className="text-xs text-faint">{formatDateTime(t.created_at)}</p>
                </div>
                <div className="text-right">
                  <Coins
                    value={t.type === 'credit' ? t.amount : -t.amount}
                    signed
                    className={`font-semibold ${t.type === 'credit' ? 'text-win' : 'text-text'}`}
                  />
                  <p className="text-xs text-faint">
                    saldo <Coins value={t.balance_after} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!state.done && rows.length > 0 && (
          <Button variant="secondary" className="w-full" disabled={state.loading} onClick={() => load(rows.at(-1).created_at)}>
            {state.loading ? 'Carregando…' : 'Carregar mais'}
          </Button>
        )}
      </section>
    </div>
  )
}
