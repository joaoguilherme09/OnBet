import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { eventDisplayStatus, searchEvents, sortOptions } from '../services/predictionService'
import { CATEGORY_LABEL, formatOdds } from '../utils/format'

/** Pesquisa de eventos e times (abre pela lupa da barra superior ou pela tecla "/"). */
export default function SearchDialog({ open, onClose }) {
  const [term, setTerm] = useState('')
  const [state, setState] = useState({ loading: false, error: null, rows: [] })
  const input = useRef(null)

  useEffect(() => {
    if (!open) return
    setTimeout(() => input.current?.focus(), 0)
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // espera a pessoa parar de digitar antes de buscar
  useEffect(() => {
    if (!open) return
    if (term.trim().length < 2) return setState({ loading: false, error: null, rows: [] })
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    const t = setTimeout(async () => {
      try {
        const rows = await searchEvents(term)
        if (alive) setState({ loading: false, error: null, rows })
      } catch (error) {
        if (alive) setState({ loading: false, error, rows: [] })
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [term, open])

  if (!open) return null
  const short = term.trim().length < 2

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-20 sm:pt-24">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Pesquisar" className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          <input
            ref={input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar time, jogo ou evento…"
            aria-label="Buscar time, jogo ou evento"
            className="h-14 flex-1 bg-transparent text-base text-text outline-none placeholder:text-faint"
          />
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Fechar pesquisa">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto p-2">
          {short ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Digite pelo menos 2 letras.</p>
          ) : state.loading && !state.rows.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Buscando…</p>
          ) : state.error ? (
            <p className="px-3 py-6 text-center text-sm text-loss">Não foi possível buscar: {state.error.message}</p>
          ) : !state.rows.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Nada encontrado para “{term.trim()}”.</p>
          ) : (
            <ul>
              {state.rows.map((e) => {
                const status = eventDisplayStatus(e)
                const top = sortOptions(e.options).filter((o) => o.status === 'active').slice(0, 3)
                return (
                  <li key={e.id}>
                    <Link
                      to={`/palpites/${e.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-raised"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.title}</p>
                        <p className="truncate text-xs text-muted">
                          {CATEGORY_LABEL[e.category]}
                          {e.competition?.name ? `, ${e.competition.name}` : ''}
                        </p>
                      </div>
                      {status === 'open' ? (
                        <span className="hidden gap-1 sm:flex">
                          {top.map((o) => (
                            <span key={o.id} className="num rounded bg-raised px-2 py-1 text-xs font-semibold text-gold-bright">
                              {formatOdds(o.odds)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <StatusBadge status={status} />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
