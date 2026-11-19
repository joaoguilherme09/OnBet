import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Coins from '../components/Coins'
import StatusBadge from '../components/StatusBadge'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { getMyParlays, getMyPredictions, getMyStats } from '../services/predictionService'
import { CATEGORY_LABEL, formatDateTime, formatOdds } from '../utils/format'

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'won', label: 'Vencedores' },
  { value: 'lost', label: 'Perdedores' },
  { value: 'void', label: 'Anulados' },
]
const KINDS = [
  { value: 'single', label: 'Simples' },
  { value: 'parlay', label: 'Múltiplas' },
]
const PAGE = 20

export default function History() {
  const stats = useAsync(() => getMyStats(), [])
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('single')
  const [rows, setRows] = useState([])
  const [state, setState] = useState({ loading: true, error: null, done: false })

  async function load(before) {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const fetchPage = kind === 'parlay' ? getMyParlays : getMyPredictions
      const page = await fetchPage({ status: status || undefined, limit: PAGE, before })
      setRows((r) => (before ? [...r, ...page] : page))
      setState({ loading: false, error: null, done: page.length < PAGE })
    } catch (error) {
      setState({ loading: false, error, done: false })
    }
  }

  useEffect(() => {
    setRows([])
    load()
  }, [status, kind]) // eslint-disable-line react-hooks/exhaustive-deps

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

      <div className="inline-flex rounded-lg border border-line-strong p-1" role="group" aria-label="Tipo de palpite">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setKind(k.value)}
            aria-pressed={kind === k.value}
            className={`rounded-md px-4 py-1.5 text-sm ${kind === k.value ? 'bg-gold text-on-gold' : 'text-muted hover:text-text'}`}
          >
            {k.label}
          </button>
        ))}
      </div>

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
          title={
            status
              ? 'Nenhum palpite com esse resultado.'
              : kind === 'parlay'
                ? 'Você ainda não fez nenhuma múltipla.'
                : 'Você ainda não fez nenhum palpite.'
          }
          action={
            !status && (
              <Button as={Link} to="/palpites">
                Ver eventos abertos
              </Button>
            )
          }
        />
      ) : kind === 'parlay' ? (
        <ul className="space-y-2">
          {rows.map((p) => (
            <ParlayRow key={p.id} parlay={p} />
          ))}
        </ul>
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

function ParlayRow({ parlay: p }) {
  return (
    <li className="card space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            Múltipla de {p.legs?.length ?? 0} palpites <span className="num text-gold-bright">{formatOdds(p.total_odds)}</span>
          </p>
          <p className="text-xs text-muted">{formatDateTime(p.created_at)}</p>
        </div>
        <StatusBadge status={p.status} />
      </div>
      <ul className="divide-y divide-line rounded-lg bg-raised/50">
        {p.legs?.map((l) => (
          <li key={l.event?.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <Link to={`/palpites/${l.event?.id}`} className="block truncate text-xs text-muted hover:text-gold-bright">
                {l.event?.title}
              </Link>
              <p>
                {l.option?.name} <span className="num text-gold-bright">{formatOdds(l.odds_snapshot)}</span>
              </p>
            </div>
            <StatusBadge status={l.status} />
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-sm">
        <span>
          <Coins value={p.stake} /> <span className="text-xs text-muted">usados</span>
        </span>
        <span className="text-xs text-muted">
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
        </span>
      </div>
    </li>
  )
}
