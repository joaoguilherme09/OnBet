import { useState } from 'react'
import PredictionCard from '../components/PredictionCard'
import { Tabs } from '../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/StateViews'
import { useAsync } from '../hooks/useAsync'
import { useBetSlip } from '../context/BetSlipContext'
import { getEvents } from '../services/predictionService'

const CATEGORIES = [
  { value: '', label: 'Todos' },
  { value: 'match', label: 'Partidas' },
  { value: 'competition', label: 'Campeões' },
  { value: 'milestone', label: 'Marcos históricos' },
]
const SCOPES = [
  { value: 'open', label: 'Abertos' },
  { value: 'closed', label: 'Aguardando resultado' },
  { value: 'finished', label: 'Encerrados' },
]

export default function Predictions() {
  const [category, setCategory] = useState('')
  const [scope, setScope] = useState('open')
  const { placedCount } = useBetSlip()
  const events = useAsync(() => getEvents({ scope, category: category || undefined }), [scope, category, placedCount])

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Palpites</h1>
        <p className="text-muted">Escolha uma opção para abrir o cupom. A odd fica registrada no momento da confirmação.</p>
      </header>

      <div className="space-y-3">
        <Tabs tabs={CATEGORIES} value={category} onChange={setCategory} />
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              aria-pressed={scope === s.value}
              className={`rounded-full border px-3 py-1 text-sm ${
                scope === s.value ? 'border-gold bg-gold/10 text-gold-bright' : 'border-line-strong text-muted hover:text-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {events.loading ? (
        <SkeletonRows rows={4} />
      ) : events.error ? (
        <ErrorState error={events.error} onRetry={events.reload} />
      ) : !events.data.length ? (
        <EmptyState title={scope === 'open' ? 'Nenhum evento aberto nesta categoria.' : 'Nada por aqui ainda.'}>
          {scope === 'open' ? 'Novos eventos aparecem quando a administração abre os palpites.' : null}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {events.data.map((e) => (
            <PredictionCard key={e.id} event={e} compact />
          ))}
        </div>
      )}
    </div>
  )
}
