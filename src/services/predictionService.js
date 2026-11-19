import { newIdempotencyKey, requireSupabase, unwrap } from './supabase'

export const EVENT_FIELDS = `
  id, title, description, rules, category, status, opens_at, closes_at,
  winning_option_id, settled_at, void_reason, competition_id, match_id,
  competition:competitions ( id, name ),
  match:matches (
    id, scheduled_at, status, home_score, away_score, stage,
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

export async function getMyParlays({ status, limit = 30, before } = {}) {
  const sb = requireSupabase()
  let q = sb.from('parlays').select(MY_PARLAY_FIELDS).order('created_at', { ascending: false }).limit(limit)
  if (status) q = q.eq('status', status)
  if (before) q = q.lt('created_at', before)
  return unwrap(await q)
}

const MY_PREDICTION_FIELDS = `
  id, stake, odds_snapshot, potential_payout, status, payout, created_at, settled_at,
  option:prediction_options!predictions_option_fk ( id, name ),
  event:prediction_events!predictions_event_id_fkey ( id, title, category, status, closes_at, void_reason )
`

export async function getMyPredictions({ status, limit = 30, before } = {}) {
  const sb = requireSupabase()
  let q = sb.from('predictions').select(MY_PREDICTION_FIELDS).order('created_at', { ascending: false }).limit(limit)
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
