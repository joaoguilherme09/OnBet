import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Coins from '../components/Coins'
import StatusBadge from '../components/StatusBadge'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { getMyPredictions, getMyStats } from '../services/predictionService'
import { CATEGORY_LABEL, formatDateTime, formatOdds } from '../utils/format'

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'won', label: 'Vencedores' },
  { value: 'lost', label: 'Perdedores' },
  { value: 'void', label: 'Anulados' },
]
const PAGE = 20

export default function History() {
  const stats = useAsync(() => getMyStats(), [])
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState([])
  const [state, setState] = useState({ loading: true, error: null, done: false })

  async function load(before) {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const page = await getMyPredictions({ status: status || undefined, limit: PAGE, before })
      setRows((r) => (before ? [...r, ...page] : page))
      setState({ loading: false, error: null, done: page.length < PAGE })
    } catch (error) {
      setState({ loading: false, error, done: false })
    }
  }

  useEffect(() => {
    setRows([])
    load()
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = stats.data
  // saldo líquido dos palpites já apurados (retornos − valor usado neles)
  const profit = s ? Number(s.returned) - Number(s.staked_settled) : 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Histórico de palpites</h1>
        <p className="text-muted">Todos os seus palpites, com a odd registrada e o resultado.</p>
      </header>

      {s && (
        <dl className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Palpites</dt>
            <dd className="num text-2xl font-semibold">{s.total}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Acertos</dt>
            <dd className="num text-2xl font-semibold text-win">
              {s.won}
              {s.hit_rate != null && <span className="ml-1.5 text-sm text-muted">{String(s.hit_rate).replace('.', ',')}%</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pendentes</dt>
            <dd className="num text-2xl font-semibold text-gold-bright">{s.pending}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Resultado dos apurados</dt>
            <dd className="text-2xl font-semibold">
              <Coins value={profit} signed className={profit > 0 ? 'text-win' : profit < 0 ? 'text-loss' : ''} />
            </dd>
          </div>
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
            className={`rounded-full border px-3 py-1 text-sm ${
              status === f.value ? 'border-gold bg-gold/10 text-gold-bright' : 'border-line-strong text-muted hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state.error ? (
        <ErrorState error={state.error} onRetry={() => load()} />
      ) : !rows.length && state.loading ? (
        <SkeletonRows rows={5} />
      ) : !rows.length ? (
        <EmptyState
          title={status ? 'Nenhum palpite com esse resultado.' : 'Você ainda não fez nenhum palpite.'}
          action={
            !status && (
              <Button as={Link} to="/palpites">
                Ver eventos abertos
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id} className="card grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <div className="min-w-0">
                <Link to={`/palpites/${p.event?.id}`} className="block truncate font-medium hover:text-gold-bright">
                  {p.event?.title}
                </Link>
                <p className="text-xs text-muted">
                  {CATEGORY_LABEL[p.event?.category]}, {formatDateTime(p.created_at)}
                </p>
              </div>
              <StatusBadge status={p.status} className="justify-self-end sm:order-last" />
              <p className="text-sm">
                {p.option?.name} <span className="num text-gold-bright">{formatOdds(p.odds_snapshot)}</span>
              </p>
              <div className="text-right text-sm sm:min-w-36">
                <p>
                  <Coins value={p.stake} /> <span className="text-xs text-muted">usados</span>
                </p>
                <p className="text-xs text-muted">
                  {p.status === 'pending' ? (
                    <>
                      retorno possível <Coins value={p.potential_payout} />
                    </>
                  ) : p.status === 'lost' ? (
                    'sem retorno'
                  ) : (
                    <>
                      creditado <Coins value={p.payout} className="text-win" />
                    </>
                  )}
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
    </div>
  )
}
