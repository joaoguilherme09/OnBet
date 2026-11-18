import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Lock, Pencil, Plus, Trash2, Unlock } from 'lucide-react'
import Button from '../../components/ui/Button'
import ConfirmButton from '../../components/ui/ConfirmButton'
import Modal from '../../components/ui/Modal'
import StatusBadge from '../../components/StatusBadge'
import Coins from '../../components/Coins'
import { Input, Select, Textarea } from '../../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/StateViews'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  deleteEvent,
  getEventPredictions,
  listCompetitionsAdmin,
  listEventsAdmin,
  listMatchesAdmin,
  saveEvent,
  setEventStatus,
} from '../../services/adminService'
import { eventDisplayStatus, sortOptions } from '../../services/predictionService'
import { CATEGORY_LABEL, EVENT_STATUS_LABEL, formatDateTime, formatOdds, fromLocalInput, toLocalInput } from '../../utils/format'

export default function AdminEvents() {
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const events = useAsync(() => listEventsAdmin({ status: status || undefined, category: category || undefined }), [status, category])
  const comps = useAsync(() => listCompetitionsAdmin(), [])
  const matches = useAsync(() => listMatchesAdmin(), [])
  const [edit, setEdit] = useState(null)
  const [viewing, setViewing] = useState(null)
  const toast = useToast()

  // abre direto o evento indicado em ?editar=
  useEffect(() => {
    const id = params.get('editar')
    if (!id || !events.data) return
    const found = events.data.find((e) => e.id === id)
    if (found) setEdit(found)
    setParams({}, { replace: true })
  }, [events.data]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(e) {
    try {
      await setEventStatus(e.id, e.status === 'open' ? 'closed' : 'open')
      toast.success(e.status === 'open' ? 'Palpites fechados.' : 'Palpites abertos.')
      events.reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select aria-label="Status" className="w-full sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(EVENT_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select aria-label="Categoria" className="w-full sm:w-48" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Button className="sm:ml-auto" onClick={() => setEdit({})}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Novo evento
        </Button>
      </div>

      {events.loading ? (
        <SkeletonRows rows={4} />
      ) : events.error ? (
        <ErrorState error={events.error} onRetry={events.reload} />
      ) : !events.data.length ? (
        <EmptyState title="Nenhum evento encontrado." />
      ) : (
        <ul className="space-y-2">
          {events.data.map((e) => {
            const count = e.predictions?.[0]?.count ?? 0
            const locked = e.status === 'settled' || e.status === 'void'
            return (
              <li key={e.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {e.title} <StatusBadge status={eventDisplayStatus(e)} />
                  </p>
                  <p className="text-xs text-muted">
                    {CATEGORY_LABEL[e.category]}
                    {e.competition?.name ? `, ${e.competition.name}` : ''}, fecha {formatDateTime(e.closes_at)}, {count}{' '}
                    {count === 1 ? 'palpite' : 'palpites'}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setViewing(e)}>
                  Palpites
                </Button>
                {(e.status === 'open' || e.status === 'closed') && (
                  <Button variant="ghost" onClick={() => toggle(e)}>
                    {e.status === 'open' ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                    {e.status === 'open' ? 'Fechar' : 'Reabrir'}
                  </Button>
                )}
                {!locked && (
                  <Button variant="secondary" onClick={() => setEdit(e)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {edit && (
        <EventModal
          event={edit}
          comps={comps.data ?? []}
          matches={matches.data ?? []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            events.reload()
          }}
        />
      )}
      {viewing && <PredictionsModal event={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

const emptyOption = () => ({ key: Math.random().toString(36).slice(2), name: '', odds: '2.00', status: 'active', description: '' })

function EventModal({ event, comps, matches, onClose, onSaved }) {
  const toast = useToast()
  const { user } = useAuth()
  const isNew = !event.id
  const [form, setForm] = useState({
    id: event.id,
    category: event.category ?? 'match',
    competition_id: event.competition_id ?? '',
    match_id: event.match_id ?? '',
    title: event.title ?? '',
    description: event.description ?? '',
    rules: event.rules ?? '',
    status: event.status ?? 'draft',
    opens_at: toLocalInput(event.opens_at ?? new Date().toISOString()),
    closes_at: toLocalInput(event.closes_at),
  })
  const [options, setOptions] = useState(
    event.options?.length
      ? sortOptions(event.options).map((o) => ({ ...o, key: o.id, odds: String(o.odds), description: o.description ?? '' }))
      : [emptyOption(), emptyOption()],
  )
  const [removed, setRemoved] = useState([])
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function pickMatch(id) {
    const m = matches.find((x) => x.id === id)
    setForm((f) => ({
      ...f,
      match_id: id,
      competition_id: m?.competition_id ?? f.competition_id,
      title: f.title || (m ? `${m.home?.name} x ${m.away?.name}` : ''),
      closes_at: m?.scheduled_at ? toLocalInput(m.scheduled_at) : f.closes_at,
    }))
  }

  const setOpt = (i, k, v) => setOptions((os) => os.map((o, j) => (j === i ? { ...o, [k]: v } : o)))
  function removeOpt(i) {
    const o = options[i]
    if (o.id) setRemoved((r) => [...r, o.id])
    setOptions((os) => os.filter((_, j) => j !== i))
  }

  async function save() {
    if (form.title.trim().length < 3) return toast.error('Informe o título do evento.')
    if (!form.closes_at) return toast.error('Informe quando os palpites fecham.')
    if (options.length < 2) return toast.error('Cadastre pelo menos 2 opções.')
    if (options.some((o) => !o.name.trim())) return toast.error('Toda opção precisa de nome.')
    if (options.some((o) => !(Number(String(o.odds).replace(',', '.')) >= 1.01))) return toast.error('As odds precisam ser no mínimo 1,01.')
    setSaving(true)
    try {
      await saveEvent({ ...form, opens_at: fromLocalInput(form.opens_at), closes_at: fromLocalInput(form.closes_at) }, options, removed, user.id)
      toast.success('Evento salvo.')
      onSaved()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const scheduledMatches = matches.filter((m) => m.status === 'scheduled' || m.id === form.match_id)

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Novo evento' : 'Editar evento'}
      size="lg"
      footer={
        <>
          {!isNew && form.status === 'draft' && (
            <ConfirmButton
              className="mr-auto"
              confirmLabel="Apagar mesmo?"
              onConfirm={async () => {
                try {
                  await deleteEvent(form.id)
                  toast.success('Evento apagado.')
                  onSaved()
                } catch (e) {
                  toast.error(e.message)
                }
              }}
            >
              Apagar rascunho
            </ConfirmButton>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar evento'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Categoria" value={form.category} onChange={set('category')} disabled={!isNew}>
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select label="Status" value={form.status} onChange={set('status')}>
          <option value="draft">Rascunho (só admin vê)</option>
          <option value="open">Aberto</option>
          <option value="closed">Fechado</option>
        </Select>

        {form.category === 'match' ? (
          <Select label="Partida" value={form.match_id} onChange={(e) => pickMatch(e.target.value)} className="sm:col-span-2">
            <option value="">Escolha…</option>
            {scheduledMatches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.home?.name} x {m.away?.name}
                {m.scheduled_at ? `, ${formatDateTime(m.scheduled_at)}` : ''}
              </option>
            ))}
          </Select>
        ) : (
          <Select
            label={form.category === 'competition' ? 'Campeonato' : 'Campeonato (opcional)'}
            value={form.competition_id}
            onChange={set('competition_id')}
            className="sm:col-span-2"
          >
            <option value="">{form.category === 'competition' ? 'Escolha…' : 'Nenhum'}</option>
            {comps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}

        <Input label="Título" value={form.title} onChange={set('title')} className="sm:col-span-2" maxLength={120} />
        <Input label="Abre em" type="datetime-local" value={form.opens_at} onChange={set('opens_at')} />
        <Input label="Fecha em" type="datetime-local" value={form.closes_at} onChange={set('closes_at')} />
        <Textarea label="Descrição (opcional)" value={form.description} onChange={set('description')} className="sm:col-span-2" />
        <Textarea
          label={form.category === 'milestone' ? 'Regras (obrigatório)' : 'Regras (opcional)'}
          hint="Critério de vitória, empate, desistência e quando o evento é anulado."
          value={form.rules}
          onChange={set('rules')}
          className="sm:col-span-2"
        />
      </div>

      <fieldset className="mt-6 space-y-2">
        <legend className="mb-1 text-sm font-semibold">Opções e odds</legend>
        <p className="text-xs text-muted">
          Mudar a odd só vale para palpites novos: os já registrados mantêm a odd da hora. Opção que já recebeu palpites não pode ser apagada,
          só inativada.
        </p>
        {options.map((o, i) => (
          <div key={o.key} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_auto]">
            <Input aria-label={`Nome da opção ${i + 1}`} placeholder="Nome" value={o.name} onChange={(e) => setOpt(i, 'name', e.target.value)} />
            <Input
              aria-label={`Odd da opção ${i + 1}`}
              inputMode="decimal"
              value={o.odds}
              onChange={(e) => setOpt(i, 'odds', e.target.value.replace(/[^\d.,]/g, ''))}
            />
            <Select aria-label={`Status da opção ${i + 1}`} className="hidden sm:block" value={o.status} onChange={(e) => setOpt(i, 'status', e.target.value)}>
              <option value="active">Ativa</option>
              <option value="inactive">Inativa</option>
            </Select>
            <button type="button" onClick={() => removeOpt(i)} className="mb-2 p-1.5 text-muted hover:text-loss" aria-label={`Remover opção ${i + 1}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button type="button" variant="ghost" onClick={() => setOptions((os) => [...os, emptyOption()])}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar opção
        </Button>
      </fieldset>
    </Modal>
  )
}

function PredictionsModal({ event, onClose }) {
  const preds = useAsync(() => getEventPredictions(event.id), [event.id])
  return (
    <Modal open onClose={onClose} title={`Palpites: ${event.title}`} size="lg">
      {preds.loading ? (
        <SkeletonRows rows={3} />
      ) : preds.error ? (
        <ErrorState error={preds.error} onRetry={preds.reload} />
      ) : !preds.data.length ? (
        <p className="text-sm text-muted">Nenhum palpite registrado.</p>
      ) : (
        <ul className="divide-y divide-line">
          {preds.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="w-28 truncate font-medium">{p.user?.username}</span>
              <span className="flex-1">
                {p.option?.name} <span className="num text-muted">{formatOdds(p.odds_snapshot)}</span>
              </span>
              <Coins value={p.stake} />
              <StatusBadge status={p.status} />
              <span className="text-xs text-faint">{formatDateTime(p.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
