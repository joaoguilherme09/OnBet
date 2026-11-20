import { newIdempotencyKey, requireSupabase, unwrap } from './supabase'

export const EVENT_FIELDS = `
  id, title, description, rules, category, status, opens_at, closes_at,
  winning_option_id, settled_at, void_reason, competition_id, match_id,
  competition:competitions ( id, name ),
  match:matches (
    id, scheduled_at, status, home_score, away_score, home_penalties, away_penalties, stage,
    home:teams!matches_home_team_id_fkey ( id, name, short_name, logo_url ),
    away:teams!matches_away_team_id_fkey ( id, name, short_name, logo_url )
  ),
  options:prediction_options!prediction_options_event_id_fkey ( id, name, description, odds, status, sort_order, team_id )
`

/** O evento aceita palpites agora? (o banco confere de novo na hora de gravar) */
export function isEventOpen(event, now = Date.now()) {
  if (!event || event.status !== 'open') return false
  if (new Date(event.opens_at).getTime() > now) return false
  if (new Date(event.closes_at).getTime() <= now) return false
  if (event.match) {
    if (event.match.status !== 'scheduled') return false
    // partida sem horário: vale só o prazo do evento
    if (event.match.scheduled_at && new Date(event.match.scheduled_at).getTime() <= now) return false
  }
  return true
}

/** Status mostrado na interface (inclui "aguardando resultado" quando o prazo passou). */
export function eventDisplayStatus(event) {
  if (event.status === 'settled') return 'settled'
  if (event.status === 'void') return 'void'
  if (event.status === 'draft') return 'draft'
  if (isEventOpen(event)) return 'open'
  if (event.status === 'open' && new Date(event.opens_at) > new Date()) return 'soon'
  return 'closed'
}

export const sortOptions = (options = []) =>
  [...options].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

/**
 * Lista eventos públicos.
 * scope: 'open' (aceitando palpites), 'closed' (aguardando resultado), 'finished' (apurados/anulados)
 */
export async function getEvents({ scope = 'open', category, limit = 50 } = {}) {
  const sb = requireSupabase()
  const now = new Date().toISOString()
  let q = sb.from('prediction_events').select(EVENT_FIELDS).limit(limit)
  if (category) q = q.eq('category', category)
  if (scope === 'open') q = q.eq('status', 'open').gt('closes_at', now).order('closes_at', { ascending: true })
  if (scope === 'closed')
    q = q.or(`status.eq.closed,and(status.eq.open,closes_at.lte."${now}")`).order('closes_at', { ascending: false })
  if (scope === 'finished') q = q.in('status', ['settled', 'void']).order('settled_at', { ascending: false })
  return unwrap(await q)
}

export async function getEvent(id) {
  const sb = requireSupabase()
  return unwrap(await sb.from('prediction_events').select(EVENT_FIELDS).eq('id', id).maybeSingle())
}

export async function getDistribution(eventId) {
  const sb = requireSupabase()
  const rows = unwrap(await sb.rpc('get_event_distribution', { p_event_id: eventId }))
  return Object.fromEntries(rows.map((r) => [r.option_id, Number(r.predictions)]))
}

export async function getSettings() {
  const sb = requireSupabase()
  return unwrap(await sb.from('app_settings').select('initial_balance, min_stake, max_stake').eq('id', 1).single())
}

/** Registra o palpite pela função segura do banco. */
export async function placePrediction({ optionId, stake, idempotencyKey = newIdempotencyKey() }) {
  const sb = requireSupabase()
  return unwrap(
    await sb.rpc('place_prediction', {
      p_option_id: optionId,
      p_stake: Math.trunc(Number(stake)),
      p_idempotency_key: idempotencyKey,
    }),
  )
}

/** Registra uma múltipla (2 a 10 palpites de eventos diferentes, odds multiplicadas). */
export async function placeParlay({ optionIds, stake, idempotencyKey = newIdempotencyKey() }) {
  const sb = requireSupabase()
  return unwrap(
    await sb.rpc('place_parlay', {
      p_option_ids: optionIds,
      p_stake: Math.trunc(Number(stake)),
      p_idempotency_key: idempotencyKey,
    }),
  )
}

const MY_PARLAY_FIELDS = `
  id, stake, total_odds, potential_payout, status, payout, created_at, settled_at,
  legs:parlay_legs ( status, odds_snapshot,
    option:prediction_options!parlay_legs_option_fk ( id, name ),
    event:prediction_events!parlay_legs_event_id_fkey ( id, title, category )
  )
`

// Quem fez o palpite (o admin lê os palpites de todos e precisa saber de quem é cada um)
const USER_FIELDS = 'user:profiles ( id, username, full_name )'

/**
 * Múltiplas. Participante: só vê as próprias (o banco garante).
 * Admin: vê as de todos; userId filtra um participante e withUser traz o nome.
 */
export async function getMyParlays({ status, limit = 30, before, userId, withUser = false } = {}) {
  const sb = requireSupabase()
  const fields = withUser ? `${MY_PARLAY_FIELDS}, ${USER_FIELDS}` : MY_PARLAY_FIELDS
  let q = sb.from('parlays').select(fields).order('created_at', { ascending: false }).limit(limit)
  if (userId) q = q.eq('user_id', userId)
  if (status) q = q.eq('status', status)
  if (before) q = q.lt('created_at', before)
  return unwrap(await q)
}

const MY_PREDICTION_FIELDS = `
  id, stake, odds_snapshot, potential_payout, status, payout, created_at, settled_at,
  option:prediction_options!predictions_option_fk ( id, name ),
  event:prediction_events!predictions_event_id_fkey ( id, title, category, status, closes_at, void_reason )
`

/** Palpites simples. Mesmas regras de getMyParlays para userId e withUser. */
export async function getMyPredictions({ status, limit = 30, before, userId, withUser = false } = {}) {
  const sb = requireSupabase()
  const fields = withUser ? `${MY_PREDICTION_FIELDS}, ${USER_FIELDS}` : MY_PREDICTION_FIELDS
  let q = sb.from('predictions').select(fields).order('created_at', { ascending: false }).limit(limit)
  if (userId) q = q.eq('user_id', userId)
  if (status) q = q.eq('status', status)
  if (before) q = q.lt('created_at', before)
  return unwrap(await q)
}

export async function getMyPredictionsForEvent(eventId) {
  const sb = requireSupabase()
  return unwrap(
    await sb.from('predictions').select(MY_PREDICTION_FIELDS).eq('event_id', eventId).order('created_at', { ascending: false }),
  )
}

export async function getMyStats() {
  const sb = requireSupabase()
  return unwrap(await sb.rpc('get_my_stats'))
}

// Evento com a partida (times e placar) e as opções, para saber qual foi a vencedora.
const MY_GAME_EVENT_FIELDS = `
  id, title, category, status, closes_at, winning_option_id, void_reason,
  match:matches (
    id, scheduled_at, status, home_score, away_score,
    home:teams!matches_home_team_id_fkey ( id, name, short_name, logo_url ),
    away:teams!matches_away_team_id_fkey ( id, name, short_name, logo_url )
  ),
  options:prediction_options!prediction_options_event_id_fkey ( id, name )
`

/**
 * Todos os jogos/eventos em que o participante palpitou, agrupados por evento.
 * Junta palpites simples e palpites dentro de múltiplas.
 * Cada item: { event, picks: [{ kind, id, option, odds, status, stake?, payout?, potential_payout?, parlay? }], status, last_at }
 */
export async function getMyGames({ userId, limit = 300 } = {}) {
  const sb = requireSupabase()
  // o admin consegue ler os palpites de todos: filtra sempre pelo próprio usuário
  if (!userId) throw new Error('Usuário não informado.')
  const [singles, legs] = await Promise.all([
    sb
      .from('predictions')
      .select(
        `id, stake, odds_snapshot, potential_payout, status, payout, created_at,
         option:prediction_options!predictions_option_fk ( id, name ),
         event:prediction_events!predictions_event_id_fkey ( ${MY_GAME_EVENT_FIELDS} )`,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    sb
      .from('parlay_legs')
      .select(
        `status, odds_snapshot,
         parlay:parlays!inner ( id, user_id, status, stake, total_odds, created_at ),
         option:prediction_options!parlay_legs_option_fk ( id, name ),
         event:prediction_events!parlay_legs_event_id_fkey ( ${MY_GAME_EVENT_FIELDS} )`,
      )
      .eq('parlay.user_id', userId)
      .limit(limit),
  ])

  const byEvent = new Map()
  const add = (event, pick) => {
    if (!event) return
    if (!byEvent.has(event.id)) byEvent.set(event.id, { event, picks: [] })
    byEvent.get(event.id).picks.push(pick)
  }
  for (const p of unwrap(singles)) {
    add(p.event, {
      kind: 'single',
      id: p.id,
      option: p.option,
      odds: p.odds_snapshot,
      status: p.status,
      stake: p.stake,
      payout: p.payout,
      potential_payout: p.potential_payout,
      created_at: p.created_at,
    })
  }
  for (const l of unwrap(legs)) {
    add(l.event, {
      kind: 'parlay',
      id: `${l.parlay?.id}:${l.event?.id}`,
      option: l.option,
      odds: l.odds_snapshot,
      status: l.status,
      parlay: l.parlay,
      created_at: l.parlay?.created_at,
    })
  }

  return [...byEvent.values()]
    .map((g) => {
      const statuses = g.picks.map((p) => p.status)
      // resultado do jogo para o participante: acertou se algum palpite bateu
      const status = statuses.includes('pending')
        ? 'pending'
        : statuses.includes('won')
          ? 'won'
          : statuses.includes('lost')
            ? 'lost'
            : 'void'
      const last_at = g.picks.reduce((m, p) => (p.created_at > m ? p.created_at : m), '')
      return { ...g, status, last_at }
    })
    .sort((a, b) => (a.last_at < b.last_at ? 1 : -1))
}

/**
 * Busca eventos pelo título (o título das partidas tem os nomes dos times).
 * Abertos primeiro, depois aguardando resultado e apurados.
 */
export async function searchEvents(term, limit = 12) {
  const sb = requireSupabase()
  // tira caracteres que têm significado especial no filtro do PostgREST
  const clean = String(term ?? '').replace(/[%_,()*\\]/g, ' ').trim()
  if (clean.length < 2) return []
  const rows = unwrap(
    await sb
      .from('prediction_events')
      .select(EVENT_FIELDS)
      .in('status', ['open', 'closed', 'settled'])
      .ilike('title', `%${clean}%`)
      .order('closes_at', { ascending: false })
      .limit(limit),
  )
  const rank = { open: 0, soon: 1, closed: 2, settled: 3 }
  return rows.sort((a, b) => (rank[eventDisplayStatus(a)] ?? 9) - (rank[eventDisplayStatus(b)] ?? 9))
}

// "ADM cauã" e "ADMcaua" viram "admcaua": sem acento, espaço ou maiúscula
const normalizeName = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** Quais times da lista este evento envolve (por time ligado à opção, partida ou nome). */
export function eventTeams(event, teams) {
  return teams.filter((t) => {
    if (!t?.id) return false
    if (event.match && (event.match.home?.id === t.id || event.match.away?.id === t.id)) return true
    if ((event.options ?? []).some((o) => o.team_id === t.id)) return true
    const name = normalizeName(t.name)
    // nomes muito curtos (ex.: "PH") só valem se forem exatamente o nome de uma opção
    if ((event.options ?? []).some((o) => normalizeName(o.name) === name)) return true
    return name.length >= 4 && normalizeName(event.title).includes(name)
  })
}

/**
 * Todas as apostas de uma partida: os eventos dela (qualquer status publicado)
 * e os eventos abertos relacionados a um dos dois times/jogadores.
 */
export async function getMatchMarkets(match) {
  const sb = requireSupabase()
  const teams = [match.home, match.away].filter(Boolean)
  const [own, open] = await Promise.all([
    sb
      .from('prediction_events')
      .select(EVENT_FIELDS)
      .eq('match_id', match.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: true }),
    getEvents({ scope: 'open', limit: 100 }),
  ])
  const ownEvents = unwrap(own)
  const ownIds = new Set(ownEvents.map((e) => e.id))
  const related = open
    .filter((e) => !ownIds.has(e.id))
    .map((e) => ({ event: e, teams: eventTeams(e, teams) }))
    .filter((r) => r.teams.length > 0)
  return { own: ownEvents, related }
}
