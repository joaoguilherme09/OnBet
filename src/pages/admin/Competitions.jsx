import { useState } from 'react'
import { Pencil, Plus, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import ConfirmButton from '../../components/ui/ConfirmButton'
import Modal from '../../components/ui/Modal'
import TeamBadge from '../../components/TeamBadge'
import { Input, Select, Textarea } from '../../components/ui/Inputs'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/StateViews'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  deleteCompetition,
  deleteTeam,
  listCompetitionsAdmin,
  listTeams,
  saveCompetition,
  saveEvent,
  saveTeam,
  setCompetitionTeams,
} from '../../services/adminService'
import { COMPETITION_STATUS_LABEL } from '../../utils/format'

export default function Competitions() {
  const teams = useAsync(() => listTeams(), [])
  const comps = useAsync(() => listCompetitionsAdmin(), [])
  const [editComp, setEditComp] = useState(null)
  const [editTeam, setEditTeam] = useState(null)
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()

  async function createChampionEvent(c) {
    const teamList = (teams.data ?? []).filter((t) => c.teams.some((x) => x.team_id === t.id))
    if (teamList.length < 2) return toast.error('Adicione pelo menos 2 times ao campeonato antes.')
    try {
      const closes = new Date(Date.now() + 7 * 864e5).toISOString()
      const ev = await saveEvent(
        {
          category: 'competition',
          competition_id: c.id,
          title: `Quem será o campeão da ${c.name}?`,
          rules: 'Vale o campeão oficial anunciado pela ORG ON Camps. Se o campeonato for cancelado, o evento é anulado e os pontos devolvidos.',
          status: 'draft',
          opens_at: new Date().toISOString(),
          closes_at: closes,
        },
        teamList.map((t) => ({ name: t.name, odds: '2.00', status: 'active', team_id: t.id })),
        [],
        user.id,
      )
      toast.success('Evento de campeão criado como rascunho. Ajuste as odds e abra.')
      navigate(`/admin/eventos?editar=${ev.id}`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Campeonatos</h2>
          <Button onClick={() => setEditComp({ status: 'planned', teams: [] })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo campeonato
          </Button>
        </div>
        {comps.loading ? (
          <SkeletonRows rows={3} />
        ) : comps.error ? (
          <ErrorState error={comps.error} onRetry={comps.reload} />
        ) : !comps.data.length ? (
          <EmptyState title="Nenhum campeonato cadastrado." />
        ) : (
          <ul className="space-y-2">
            {comps.data.map((c) => (
              <li key={c.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted">
                    {COMPETITION_STATUS_LABEL[c.status]}, {c.teams.length} {c.teams.length === 1 ? 'time' : 'times'}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => createChampionEvent(c)}>
                  <Trophy className="h-4 w-4" aria-hidden="true" /> Evento de campeão
                </Button>
                <Button variant="secondary" onClick={() => setEditComp(c)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Times</h2>
          <Button variant="secondary" onClick={() => setEditTeam({})}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo time
          </Button>
        </div>
        {teams.loading ? (
          <SkeletonRows rows={3} />
        ) : !teams.data?.length ? (
          <EmptyState title="Nenhum time cadastrado." />
        ) : (
          <ul className="card divide-y divide-line">
            {teams.data.map((t) => (
              <li key={t.id}>
                <button onClick={() => setEditTeam(t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-raised">
                  <TeamBadge team={t} size="sm" />
                  <span className="flex-1 truncate">{t.name}</span>
                  <Pencil className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editComp && (
        <CompetitionModal
          competition={editComp}
          teams={teams.data ?? []}
          onClose={() => setEditComp(null)}
          onSaved={() => {
            setEditComp(null)
            comps.reload()
          }}
        />
      )}
      {editTeam && (
        <TeamModal
          team={editTeam}
          onClose={() => setEditTeam(null)}
          onSaved={() => {
            setEditTeam(null)
            teams.reload()
          }}
        />
      )}
    </div>
  )
}

function CompetitionModal({ competition, teams, onClose, onSaved }) {
  const toast = useToast()
  const { user } = useAuth()
  const current = competition.teams.map((t) => t.team_id)
  const [form, setForm] = useState({
    id: competition.id,
    name: competition.name ?? '',
    description: competition.description ?? '',
    logo_url: competition.logo_url ?? '',
    status: competition.status ?? 'planned',
    starts_on: competition.starts_on ?? '',
    ends_on: competition.ends_on ?? '',
  })
  const [selected, setSelected] = useState(current)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (form.name.trim().length < 2) return toast.error('Informe o nome do campeonato.')
    setSaving(true)
    try {
      const saved = await saveCompetition(form, user.id)
      await setCompetitionTeams(saved.id, selected, current)
      toast.success('Campeonato salvo.')
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
      title={form.id ? 'Editar campeonato' : 'Novo campeonato'}
      size="lg"
      footer={
        <>
          {form.id && (
            <ConfirmButton
              className="mr-auto"
              confirmLabel="Apagar mesmo?"
              onConfirm={async () => {
                try {
                  await deleteCompetition(form.id)
                  toast.success('Campeonato apagado.')
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
            {saving ? 'Salvando…' : 'Salvar campeonato'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Nome" value={form.name} onChange={set('name')} className="sm:col-span-2" maxLength={80} />
        <Select label="Status" value={form.status} onChange={set('status')}>
          {Object.entries(COMPETITION_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Input label="URL do logo (opcional)" value={form.logo_url} onChange={set('logo_url')} />
        <Input label="Início" type="date" value={form.starts_on} onChange={set('starts_on')} />
        <Input label="Fim" type="date" value={form.ends_on} onChange={set('ends_on')} />
        <Textarea label="Descrição" value={form.description} onChange={set('description')} className="sm:col-span-2" />
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm">Times participantes</legend>
          {!teams.length ? (
            <p className="text-sm text-muted">Cadastre os times na coluna ao lado primeiro.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {teams.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-gold">
                  <input
                    type="checkbox"
                    className="accent-[var(--color-gold)]"
                    checked={selected.includes(t.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id)))}
                  />
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>
    </Modal>
  )
}

function TeamModal({ team, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ id: team.id, name: team.name ?? '', short_name: team.short_name ?? '', logo_url: team.logo_url ?? '' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (form.name.trim().length < 2) return toast.error('Informe o nome do time.')
    setSaving(true)
    try {
      await saveTeam(form)
      toast.success('Time salvo.')
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
      title={form.id ? 'Editar time' : 'Novo time'}
      size="sm"
      footer={
        <>
          {form.id && (
            <ConfirmButton
              className="mr-auto"
              confirmLabel="Apagar mesmo?"
              onConfirm={async () => {
                try {
                  await deleteTeam(form.id)
                  toast.success('Time apagado.')
                  onSaved()
                } catch (e) {
                  toast.error(e.message)
                }
              }}
            >
              Apagar
            </ConfirmButton>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar time'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Nome" value={form.name} onChange={set('name')} maxLength={60} />
        <Input label="Sigla (2 a 5 letras)" value={form.short_name} onChange={set('short_name')} maxLength={5} />
        <Input label="URL do escudo (opcional)" value={form.logo_url} onChange={set('logo_url')} hint="PNG ou SVG com fundo transparente." />
      </div>
    </Modal>
  )
}
