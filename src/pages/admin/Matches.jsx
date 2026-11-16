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
import { MATCH_STATUS_LABEL, formatDateTime, fromLocalInput, toLocalInput } from '../../utils/format'

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
            const ev = m.events?.[0]
            return (
              <li key={m.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.home?.name} {m.status === 'finished' ? `${m.home_score} x ${m.away_score}` : 'x'} {m.away?.name}
                  </p>
                  <p className="text-xs text-muted">
                    {m.competition?.name}
                    {m.stage ? `, ${m.stage}` : ''}, {formatDateTime(m.scheduled_at)}, {MATCH_STATUS_LABEL[m.status]}
                  </p>
                </div>
                {ev ? (
                  <Button as={Link} variant="ghost" to={`/admin/eventos?editar=${ev.id}`}>
                    <Ticket className="h-4 w-4" aria-hidden="true" /> Ver evento
                  </Button>
                ) : (
                  m.status === 'scheduled' && (
                    <Button variant="ghost" onClick={() => setEventFor(m)}>
                      <Ticket className="h-4 w-4" aria-hidden="true" /> Criar palpite 1X2
                    </Button>
                  )
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
        <OneXTwoModal
          match={eventFor}
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
    scheduled_at: toLocalInput(match.scheduled_at),
    status: match.status ?? 'scheduled',
    home_score: match.home_score ?? '',
    away_score: match.away_score ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // times do campeonato escolhido (ou todos, se o campeonato ainda não tem times)
  const comp = comps.find((c) => c.id === form.competition_id)
  const compTeamIds = comp?.teams.map((t) => t.team_id) ?? []
  const teamOptions = compTeamIds.length ? teams.filter((t) => compTeamIds.includes(t.id)) : teams

  async function save() {
    if (!form.competition_id || !form.home_team_id || !form.away_team_id || !form.scheduled_at)
      return toast.error('Preencha campeonato, times e data.')
    setSaving(true)
    try {
      await saveMatch({ ...form, scheduled_at: fromLocalInput(form.scheduled_at) })
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
        <Input label="Data e horário" type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
        <Input label="Fase (opcional)" value={form.stage} onChange={set('stage')} placeholder="Ex.: Semifinal" />
        <Select label="Status" value={form.status} onChange={set('status')}>
          {Object.entries(MATCH_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Gols mandante" inputMode="numeric" value={form.home_score} onChange={set('home_score')} />
          <Input label="Gols visitante" inputMode="numeric" value={form.away_score} onChange={set('away_score')} />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        O placar não apura o evento sozinho: depois de finalizar, vá em Resultados e confirme a opção vencedora.
      </p>
    </Modal>
  )
}

function OneXTwoModal({ match, onClose, onSaved }) {
  const toast = useToast()
  const { user } = useAuth()
  const [odds, setOdds] = useState({ home: '2.10', draw: '3.20', away: '2.80' })
  const [status, setStatus] = useState('open')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await saveEvent(
        {
          category: 'match',
          competition_id: match.competition_id,
          match_id: match.id,
          title: `${match.home.name} x ${match.away.name}`,
          status,
          opens_at: new Date().toISOString(),
          closes_at: match.scheduled_at,
        },
        [
          { name: match.home.name, odds: odds.home, status: 'active', team_id: match.home_team_id },
          { name: 'Empate', odds: odds.draw, status: 'active' },
          { name: match.away.name, odds: odds.away, status: 'active', team_id: match.away_team_id },
        ],
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

  const set = (k) => (e) => setOdds((o) => ({ ...o, [k]: e.target.value.replace(/[^\d.,]/g, '') }))

  return (
    <Modal
      open
      onClose={onClose}
      title="Criar palpite 1X2"
      size="sm"
      footer={
        <Button onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : status === 'open' ? 'Abrir palpites' : 'Salvar rascunho'}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {match.home.name} x {match.away.name}. Os palpites fecham no horário da partida ({formatDateTime(match.scheduled_at)}).
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Input label={match.home.name} inputMode="decimal" value={odds.home} onChange={set('home')} />
          <Input label="Empate" inputMode="decimal" value={odds.draw} onChange={set('draw')} />
          <Input label={match.away.name} inputMode="decimal" value={odds.away} onChange={set('away')} />
        </div>
        <Select label="Publicação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Abrir agora</option>
          <option value="draft">Salvar como rascunho</option>
        </Select>
      </div>
    </Modal>
  )
}
