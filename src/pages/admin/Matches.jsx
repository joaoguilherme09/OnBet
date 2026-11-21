import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Ticket, Trash2 } from 'lucide-react'
import Button from '../../components/ui/Button'
import ConfirmButton from '../../components/ui/ConfirmButton'
import Modal from '../../components/ui/Modal'
import { Input, Select } from '../../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/StateViews'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { deleteMatch, listCompetitionsAdmin, listMatchesAdmin, listTeams, saveEvent, saveMatch } from '../../services/adminService'
import { MATCH_STATUS_LABEL, formatScore, fromLocalInput } from '../../utils/format'

export default function AdminMatches() {
  const [competitionId, setCompetitionId] = useState('')
  const comps = useAsync(() => listCompetitionsAdmin(), [])
  const teams = useAsync(() => listTeams(), [])
  const matches = useAsync(() => listMatchesAdmin({ competitionId: competitionId || undefined }), [competitionId])
  const [edit, setEdit] = useState(null)
  const [eventFor, setEventFor] = useState(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select aria-label="Campeonato" className="w-full sm:w-72" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
          <option value="">Todos os campeonatos</option>
          {(comps.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button onClick={() => setEdit({ status: 'scheduled', competition_id: competitionId })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova partida
        </Button>
      </div>

      {matches.loading ? (
        <SkeletonRows rows={4} />
      ) : matches.error ? (
        <ErrorState error={matches.error} onRetry={matches.reload} />
      ) : !matches.data.length ? (
        <EmptyState title="Nenhuma partida cadastrada.">Cadastre campeonatos e times antes de criar partidas.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {matches.data.map((m) => {
            const events = m.events ?? []
            // modelos que ainda não foram criados para esta partida
            const missing = Object.keys(MARKETS).filter((type) => !events.some((e) => MARKETS[type].titles(m).includes(e.title)))
            return (
              <li key={m.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.home?.name} {m.status === 'finished' ? formatScore(m) : 'x'} {m.away?.name}
                  </p>
                  <p className="text-xs text-muted">
                    {m.competition?.name}
                    {m.stage ? `, ${m.stage}` : ''}, {MATCH_STATUS_LABEL[m.status]}
                  </p>
                </div>
                {events.length === 1 && (
                  <Button as={Link} variant="ghost" to={`/admin/eventos?editar=${events[0].id}`}>
                    <Ticket className="h-4 w-4" aria-hidden="true" /> Ver evento
                  </Button>
                )}
                {events.length > 1 && (
                  <Button as={Link} variant="ghost" to="/admin/eventos">
                    <Ticket className="h-4 w-4" aria-hidden="true" /> Ver eventos ({events.length})
                  </Button>
                )}
                {m.status === 'scheduled' && missing.length > 0 && (
                  <Button variant="ghost" onClick={() => setEventFor({ match: m, missing })}>
                    <Ticket className="h-4 w-4" aria-hidden="true" /> {missing.includes('1x2') ? 'Criar palpite 1X2' : 'Adicionar eventos'}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setEdit(m)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {edit && (
        <MatchModal
          match={edit}
          comps={comps.data ?? []}
          teams={teams.data ?? []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            matches.reload()
          }}
        />
      )}
      {eventFor && (
        <MatchEventsModal
          match={eventFor.match}
          missing={eventFor.missing}
          onClose={() => setEventFor(null)}
          onSaved={() => {
            setEventFor(null)
            matches.reload()
          }}
        />
      )}
    </div>
  )
}

function MatchModal({ match, comps, teams, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({
    id: match.id,
    competition_id: match.competition_id ?? '',
    home_team_id: match.home_team_id ?? '',
    away_team_id: match.away_team_id ?? '',
    stage: match.stage ?? '',
    status: match.status ?? 'scheduled',
    home_score: match.home_score ?? '',
    away_score: match.away_score ?? '',
    home_penalties: match.home_penalties ?? '',
    away_penalties: match.away_penalties ?? '',
  })
  const [penalties, setPenalties] = useState(match.home_penalties != null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const finished = form.status === 'finished'

  // times do campeonato escolhido (ou todos, se o campeonato ainda não tem times)
  const comp = comps.find((c) => c.id === form.competition_id)
  const compTeamIds = comp?.teams.map((t) => t.team_id) ?? []
  const teamOptions = compTeamIds.length ? teams.filter((t) => compTeamIds.includes(t.id)) : teams

  async function save() {
    if (!form.competition_id || !form.home_team_id || !form.away_team_id)
      return toast.error('Preencha campeonato e times.')
    const withPenalties = finished && penalties
    if (withPenalties) {
      if (form.home_penalties === '' || form.away_penalties === '') return toast.error('Preencha o placar dos pênaltis.')
      if (Number(form.home_penalties) === Number(form.away_penalties)) return toast.error('Os pênaltis não podem terminar empatados.')
    }
    setSaving(true)
    try {
      await saveMatch({
        ...form,
        scheduled_at: null,
        // pênaltis só valem em partida finalizada
        home_penalties: withPenalties ? form.home_penalties : null,
        away_penalties: withPenalties ? form.away_penalties : null,
      })
      toast.success('Partida salva.')
      onSaved()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? 'Editar partida' : 'Nova partida'}
      footer={
        <>
          {form.id && (
            <ConfirmButton
              className="mr-auto"
              confirmLabel="Apagar mesmo?"
              onConfirm={async () => {
                try {
                  await deleteMatch(form.id)
                  toast.success('Partida apagada.')
                  onSaved()
                } catch (e) {
                  toast.error(e.message)
                }
              }}
            >
              Apagar
            </ConfirmButton>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar partida'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Campeonato" value={form.competition_id} onChange={set('competition_id')} className="sm:col-span-2">
          <option value="">Escolha…</option>
          {comps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label="Mandante" value={form.home_team_id} onChange={set('home_team_id')}>
          <option value="">Escolha…</option>
          {teamOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select label="Visitante" value={form.away_team_id} onChange={set('away_team_id')}>
          <option value="">Escolha…</option>
          {teamOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input label="Fase (opcional)" value={form.stage} onChange={set('stage')} placeholder="Ex.: Semifinal" />
        <Select label="Status" value={form.status} onChange={set('status')}>
          {Object.entries(MATCH_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        {/* placar só faz sentido depois que a partida aconteceu */}
        {form.status === 'finished' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Gols mandante" inputMode="numeric" value={form.home_score} onChange={set('home_score')} />
            <Input label="Gols visitante" inputMode="numeric" value={form.away_score} onChange={set('away_score')} />
          </div>
        )}
        {/* qualquer partida finalizada pode ter pênaltis (ex.: empate no agregado de ida e volta) */}
        {finished && (
          <div className="space-y-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={penalties} onChange={(e) => setPenalties(e.target.checked)} className="accent-gold" />
              Decidido nos pênaltis
            </label>
            {penalties && (
              <div className="grid grid-cols-2 gap-3 sm:w-1/2">
                <Input label="Pênaltis mandante" inputMode="numeric" value={form.home_penalties} onChange={set('home_penalties')} />
                <Input label="Pênaltis visitante" inputMode="numeric" value={form.away_penalties} onChange={set('away_penalties')} />
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        O placar não apura o evento sozinho: depois de finalizar, vá em Resultados e confirme a opção vencedora.
      </p>
    </Modal>
  )
}

const GOAL_LINES = ['0.5', '1.5', '2.5', '3.5', '4.5', '5.5', '6.5', '7.5']
// odds iniciais só de sugestão: o admin ajusta antes de abrir
const OVER_ODDS = ['1.05', '1.25', '1.70', '2.50', '4.00', '6.50', '10.00', '15.00']
const UNDER_ODDS = ['12.00', '4.50', '2.20', '1.55', '1.25', '1.10', '1.05', '1.02']

const matchName = (m) => `${m.home?.name} x ${m.away?.name}`

/**
 * Eventos que o popup da partida cria com um clique.
 * titles: o primeiro é o título usado ao criar; os outros são nomes antigos, só para
 * reconhecer eventos que já existem.
 */
const MARKETS = {
  '1x2': {
    heading: 'Quem vence?',
    titles: (m) => [matchName(m)],
    options: (m) => [
      { key: 'home', name: m.home.name, odds: '2.10', team_id: m.home_team_id },
      { key: 'draw', name: 'Empate', odds: '3.20' },
      { key: 'away', name: m.away.name, odds: '2.80', team_id: m.away_team_id },
    ],
  },
  quem_passa: {
    heading: 'Quem vai se classificar?',
    titles: (m) => [`${matchName(m)}: quem vai se classificar?`, `${matchName(m)}: quem passa?`],
    rules: 'Vale quem se classifica, contando prorrogação e pênaltis.',
    options: (m) => [
      { key: 'home', name: m.home.name, odds: '1.80', team_id: m.home_team_id },
      { key: 'away', name: m.away.name, odds: '1.80', team_id: m.away_team_id },
    ],
  },
  gols: {
    heading: 'Quantidade de gols na partida?',
    titles: (m) => [`${matchName(m)}: quantidade de gols na partida?`, `${matchName(m)}: +/- gols na partida`],
    rules: 'Conta o total de gols da partida (mandante + visitante). Pênaltis não contam. Mais de uma opção pode bater.',
    options: () => [
      ...GOAL_LINES.map((l, i) => ({ key: `over${l}`, name: `+${l} gols`, odds: OVER_ODDS[i] })),
      ...GOAL_LINES.map((l, i) => ({ key: `under${l}`, name: `-${l} gols`, odds: UNDER_ODDS[i] })),
    ],
  },
}

/**
 * Popup "Criar palpite 1X2": já vem com quem vence (times, empate e odds).
 * No final, botões para adicionar também "quem vai se classificar?" e
 * "quantidade de gols na partida?". Salvar cria todos os eventos escolhidos.
 */
function MatchEventsModal({ match, missing, onClose, onSaved }) {
  const toast = useToast()
  const { user } = useAuth()
  // eventos incluídos no popup, cada um com as suas opções e odds
  const [sections, setSections] = useState(() =>
    missing.includes('1x2') ? [{ type: '1x2', options: MARKETS['1x2'].options(match) }] : [],
  )
  const [status, setStatus] = useState('open')
  const [closesAt, setClosesAt] = useState('')
  const [saving, setSaving] = useState(false)

  const addable = missing.filter((t) => t !== '1x2' && !sections.some((s) => s.type === t))
  const add = (type) => setSections((ss) => [...ss, { type, options: MARKETS[type].options(match) }])
  const remove = (type) => setSections((ss) => ss.filter((s) => s.type !== type))
  const setOdds = (type, key) => (e) => {
    const v = e.target.value.replace(/[^\d.,]/g, '')
    setSections((ss) =>
      ss.map((s) => (s.type === type ? { ...s, options: s.options.map((o) => (o.key === key ? { ...o, odds: v } : o)) } : s)),
    )
  }

  async function save() {
    if (!sections.length) return toast.error('Adicione pelo menos um evento.')
    if (!closesAt) return toast.error('Informe até quando os palpites ficam abertos.')
    if (sections.some((s) => s.options.some((o) => !(Number(String(o.odds).replace(',', '.')) >= 1.01))))
      return toast.error('As odds precisam ser no mínimo 1,01.')
    setSaving(true)
    let created = 0
    try {
      for (const s of sections) {
        const market = MARKETS[s.type]
        await saveEvent(
          {
            category: 'match',
            competition_id: match.competition_id,
            match_id: match.id,
            title: market.titles(match)[0],
            rules: market.rules,
            status,
            opens_at: new Date().toISOString(),
            closes_at: fromLocalInput(closesAt),
          },
          s.options.map(({ name, odds, team_id }) => ({ name, odds, team_id, status: 'active' })),
          [],
          user.id,
        )
        created += 1
      }
      const what = created === 1 ? 'Evento' : `${created} eventos`
      toast.success(status === 'open' ? `${what} aberto(s) para palpites.` : `${what} salvo(s) como rascunho.`)
      onSaved()
    } catch (e) {
      // os que já foram criados ficam: recarrega a lista para não duplicar
      toast.error(created ? `${created} evento(s) criado(s), mas houve um erro: ${e.message}` : e.message)
      if (created) onSaved()
    } finally {
      setSaving(false)
    }
  }

  const gridFor = (s) => (s.type === 'gols' ? 'grid-cols-2 sm:grid-cols-4' : s.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')

  return (
    <Modal
      open
      onClose={onClose}
      title={missing.includes('1x2') ? 'Criar palpite 1X2' : 'Adicionar eventos'}
      size={sections.some((s) => s.type === 'gols') ? 'lg' : 'md'}
      footer={
        <Button onClick={save} disabled={saving || !sections.length}>
          {saving ? 'Salvando…' : status === 'open' ? 'Abrir palpites' : 'Salvar rascunho'}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {matchName(match)}. Os palpites ficam abertos até o prazo abaixo, ou até você marcar a partida como &quot;ao vivo&quot; ou
          &quot;finalizada&quot;.
        </p>
        <Input label="Palpites fecham em" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />

        {sections.map((s) => (
          <section key={s.type} className="space-y-3 rounded-lg border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{MARKETS[s.type].heading}</h3>
              {s.type !== '1x2' && (
                <button
                  type="button"
                  onClick={() => remove(s.type)}
                  className="p-1 text-muted hover:text-loss"
                  aria-label={`Remover ${MARKETS[s.type].heading}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className={`grid gap-3 ${gridFor(s)}`}>
              {s.options.map((o) => (
                <Input key={o.key} label={o.name} inputMode="decimal" value={o.odds} onChange={setOdds(s.type, o.key)} />
              ))}
            </div>
          </section>
        ))}

        <Select label="Publicação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Abrir agora</option>
          <option value="draft">Salvar como rascunho</option>
        </Select>

        {addable.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap">
            {addable.map((t) => (
              <Button key={t} type="button" variant="secondary" onClick={() => add(t)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar evento &quot;{MARKETS[t].heading}&quot;
              </Button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
