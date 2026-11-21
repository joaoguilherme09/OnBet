import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Ticket } from 'lucide-react'
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
            const missing = Object.entries(MARKETS).filter(([, mk]) => !events.some((e) => e.title === mk.title(m)))
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
                {m.status === 'scheduled' &&
                  missing.map(([type, mk]) => (
                    <Button key={type} variant="ghost" onClick={() => setEventFor({ match: m, type })}>
                      <Plus className="h-4 w-4" aria-hidden="true" /> {mk.button}
                    </Button>
                  ))}
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
        <MarketModal
          match={eventFor.match}
          type={eventFor.type}
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
 * Modelos de evento que dá para criar com um clique a partir da partida.
 * O título identifica o modelo: assim a lista sabe quais já foram criados.
 */
const MARKETS = {
  '1x2': {
    button: 'Quem vence (1X2)',
    modalTitle: 'Criar palpite 1X2',
    title: (m) => matchName(m),
    options: (m) => [
      { key: 'home', name: m.home.name, odds: '2.10', team_id: m.home_team_id },
      { key: 'draw', name: 'Empate', odds: '3.20' },
      { key: 'away', name: m.away.name, odds: '2.80', team_id: m.away_team_id },
    ],
  },
  quem_passa: {
    button: 'Quem passa',
    modalTitle: 'Criar palpite "quem passa"',
    title: (m) => `${matchName(m)}: quem passa?`,
    rules: 'Vale quem se classifica, contando prorrogação e pênaltis.',
    options: (m) => [
      { key: 'home', name: m.home.name, odds: '1.80', team_id: m.home_team_id },
      { key: 'away', name: m.away.name, odds: '1.80', team_id: m.away_team_id },
    ],
  },
  gols: {
    button: '+/- gols',
    modalTitle: 'Criar palpite "+/- gols na partida"',
    title: (m) => `${matchName(m)}: +/- gols na partida`,
    rules: 'Conta o total de gols da partida (mandante + visitante). Pênaltis não contam.',
    options: () => [
      ...GOAL_LINES.map((l, i) => ({ key: `over${l}`, name: `+${l} gols`, odds: OVER_ODDS[i] })),
      ...GOAL_LINES.map((l, i) => ({ key: `under${l}`, name: `-${l} gols`, odds: UNDER_ODDS[i] })),
    ],
  },
}

function MarketModal({ match, type, onClose, onSaved }) {
  const toast = useToast()
  const { user } = useAuth()
  const market = MARKETS[type]
  const [options, setOptions] = useState(() => market.options(match))
  const [status, setStatus] = useState('open')
  const [closesAt, setClosesAt] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!closesAt) return toast.error('Informe até quando os palpites ficam abertos.')
    if (options.some((o) => !(Number(String(o.odds).replace(',', '.')) >= 1.01))) return toast.error('As odds precisam ser no mínimo 1,01.')
    setSaving(true)
    try {
      await saveEvent(
        {
          category: 'match',
          competition_id: match.competition_id,
          match_id: match.id,
          title: market.title(match),
          rules: market.rules,
          status,
          opens_at: new Date().toISOString(),
          closes_at: fromLocalInput(closesAt),
        },
        options.map(({ name, odds, team_id }) => ({ name, odds, team_id, status: 'active' })),
        [],
        user.id,
      )
      toast.success(status === 'open' ? 'Palpites abertos para a partida.' : 'Evento salvo como rascunho.')
      onSaved()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const setOdds = (key) => (e) => {
    const v = e.target.value.replace(/[^\d.,]/g, '')
    setOptions((os) => os.map((o) => (o.key === key ? { ...o, odds: v } : o)))
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={market.modalTitle}
      size={type === 'gols' ? 'md' : 'sm'}
      footer={
        <Button onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : status === 'open' ? 'Abrir palpites' : 'Salvar rascunho'}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {matchName(match)}. Os palpites ficam abertos até o prazo abaixo, ou até você marcar a partida como "ao vivo" ou
          "finalizada".
        </p>
        <Input label="Palpites fecham em" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        <div className={`grid gap-3 ${type === 'gols' ? 'grid-cols-2 sm:grid-cols-4' : options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {options.map((o) => (
            <Input key={o.key} label={o.name} inputMode="decimal" value={o.odds} onChange={setOdds(o.key)} />
          ))}
        </div>
        <Select label="Publicação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Abrir agora</option>
          <option value="draft">Salvar como rascunho</option>
        </Select>
      </div>
    </Modal>
  )
}
