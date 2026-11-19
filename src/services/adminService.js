import { newIdempotencyKey, requireSupabase, unwrap } from './supabase'
import { EVENT_FIELDS } from './predictionService'

const sb = () => requireSupabase()

// ---- painel -------------------------------------------------------------
export const getDashboardStats = async () => unwrap(await sb().rpc('admin_dashboard_stats'))

export const getAuditLog = async (limit = 25) =>
  unwrap(
    await sb()
      .from('admin_audit_log')
      .select('id, action, target_table, target_id, details, reason, created_at, admin:profiles ( username )')
      .order('created_at', { ascending: false })
      .limit(limit),
  )

export const getSettings = async () => unwrap(await sb().from('app_settings').select('*').eq('id', 1).single())

export const updateSettings = async ({ initial_balance, min_stake, max_stake }) =>
  unwrap(
    await sb().rpc('admin_update_settings', {
      p_initial_balance: Number(initial_balance),
      p_min_stake: Number(min_stake),
      p_max_stake: Number(max_stake),
    }),
  )

// ---- times e campeonatos -----------------------------------------------
export const listTeams = async () =>
  unwrap(await sb().from('teams').select('id, name, short_name, logo_url').order('name'))

export const saveTeam = async ({ id, name, logo_url }) => {
  const row = { name: name.trim(), logo_url: logo_url?.trim() || null }
  const q = id ? sb().from('teams').update(row).eq('id', id) : sb().from('teams').insert(row)
  return unwrap(await q.select().single())
}

export const deleteTeam = async (id) => unwrap(await sb().from('teams').delete().eq('id', id))

export const listCompetitionsAdmin = async () =>
  unwrap(
    await sb()
      .from('competitions')
      .select('id, name, description, logo_url, status, starts_on, ends_on, created_at, teams:competition_teams ( team_id )')
      .order('created_at', { ascending: false }),
  )

export const saveCompetition = async ({ id, name, description, logo_url, status, starts_on, ends_on }, userId) => {
  const row = {
    name: name.trim(),
    description: description?.trim() || null,
    logo_url: logo_url?.trim() || null,
    status,
    starts_on: starts_on || null,
    ends_on: ends_on || null,
  }
  const q = id
    ? sb().from('competitions').update(row).eq('id', id)
    : sb().from('competitions').insert({ ...row, created_by: userId })
  return unwrap(await q.select().single())
}

export const deleteCompetition = async (id) => unwrap(await sb().from('competitions').delete().eq('id', id))

/** Define exatamente quais times participam do campeonato. */
export async function setCompetitionTeams(competitionId, teamIds, currentIds) {
  const add = teamIds.filter((t) => !currentIds.includes(t))
  const remove = currentIds.filter((t) => !teamIds.includes(t))
  if (add.length)
    unwrap(await sb().from('competition_teams').insert(add.map((team_id) => ({ competition_id: competitionId, team_id }))))
  if (remove.length)
    unwrap(await sb().from('competition_teams').delete().eq('competition_id', competitionId).in('team_id', remove))
}

// ---- partidas -------------------------------------------------------------
export const listMatchesAdmin = async ({ competitionId } = {}) => {
  let q = sb()
    .from('matches')
    .select(`
      id, competition_id, home_team_id, away_team_id, stage, scheduled_at, status, home_score, away_score, home_penalties, away_penalties,
      competition:competitions ( id, name ),
      home:teams!matches_home_team_id_fkey ( id, name, short_name ),
      away:teams!matches_away_team_id_fkey ( id, name, short_name ),
      events:prediction_events ( id, status )
    `)
    .order('created_at', { ascending: false })
    .limit(200)
  if (competitionId) q = q.eq('competition_id', competitionId)
  return unwrap(await q)
}

export const saveMatch = async ({ id, competition_id, home_team_id, away_team_id, stage, scheduled_at, status, home_score, away_score, home_penalties, away_penalties }) => {
  const row = {
    competition_id,
    home_team_id,
    away_team_id,
    stage: stage?.trim() || null,
    scheduled_at,
    status,
    home_score: home_score === '' || home_score == null ? null : Number(home_score),
    away_score: away_score === '' || away_score == null ? null : Number(away_score),
    home_penalties: home_penalties === '' || home_penalties == null ? null : Number(home_penalties),
    away_penalties: away_penalties === '' || away_penalties == null ? null : Number(away_penalties),
  }
  const q = id ? sb().from('matches').update(row).eq('id', id) : sb().from('matches').insert(row)
  return unwrap(await q.select().single())
}

export const deleteMatch = async (id) => unwrap(await sb().from('matches').delete().eq('id', id))

// ---- eventos e opções ------------------------------------------------------
export const listEventsAdmin = async ({ status, category } = {}) => {
  let q = sb()
    .from('prediction_events')
    .select(`${EVENT_FIELDS}, predictions:predictions ( count )`)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status) q = q.eq('status', status)
  if (category) q = q.eq('category', category)
  return unwrap(await q)
}

/**
 * Salva o evento e sincroniza as opções.
 * Opções existentes são atualizadas; novas, inseridas; removidas, apagadas
 * (o banco recusa apagar opção que já recebeu palpites — inative em vez disso).
 */
export async function saveEvent(event, options, removedOptionIds, userId) {
  const row = {
    category: event.category,
    competition_id: event.competition_id || null,
    match_id: event.category === 'match' ? event.match_id || null : null,
    title: event.title.trim(),
    description: event.description?.trim() || null,
    rules: event.rules?.trim() || null,
    status: event.status,
    opens_at: event.opens_at,
    closes_at: event.closes_at,
  }
  const saved = event.id
    ? unwrap(await sb().from('prediction_events').update(row).eq('id', event.id).select().single())
    : unwrap(await sb().from('prediction_events').insert({ ...row, created_by: userId }).select().single())

  if (removedOptionIds.length) unwrap(await sb().from('prediction_options').delete().in('id', removedOptionIds))

  for (const [i, o] of options.entries()) {
    const optRow = {
      name: o.name.trim(),
      description: o.description?.trim() || null,
      odds: Number(String(o.odds).replace(',', '.')),
      status: o.status,
      team_id: o.team_id || null,
      sort_order: i,
    }
    if (o.id) unwrap(await sb().from('prediction_options').update(optRow).eq('id', o.id))
    else unwrap(await sb().from('prediction_options').insert({ ...optRow, event_id: saved.id }))
  }
  return saved
}

export const setEventStatus = async (id, status) =>
  unwrap(await sb().from('prediction_events').update({ status }).eq('id', id).select().single())

export const deleteEvent = async (id) => unwrap(await sb().from('prediction_events').delete().eq('id', id))

export const getEventSummary = async (eventId) => unwrap(await sb().rpc('admin_event_summary', { p_event_id: eventId }))

export const settleEvent = async (eventId, optionId) =>
  unwrap(await sb().rpc('settle_event', { p_event_id: eventId, p_winning_option_id: optionId }))

export const voidEvent = async (eventId, reason) => unwrap(await sb().rpc('void_event', { p_event_id: eventId, p_reason: reason }))

export const getEventPredictions = async (eventId) =>
  unwrap(
    await sb()
      .from('predictions')
      .select('id, stake, odds_snapshot, potential_payout, status, payout, created_at, user:profiles ( username ), option:prediction_options!predictions_option_fk ( name )')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(500),
  )

// ---- participantes -------------------------------------------------------
export const listUsers = async (search = '', limit = 50, offset = 0) =>
  unwrap(await sb().rpc('admin_list_users', { p_search: search || null, p_limit: limit, p_offset: offset }))

export async function getUserActivity(userId) {
  const [wallet, predictions] = await Promise.all([
    sb().from('wallets').select('id, balance').eq('user_id', userId).single().then(unwrap),
    sb()
      .from('predictions')
      .select('id, stake, odds_snapshot, status, payout, created_at, event:prediction_events!predictions_event_id_fkey ( title ), option:prediction_options!predictions_option_fk ( name )')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(unwrap),
  ])
  const transactions = unwrap(
    await sb()
      .from('transactions')
      .select('id, type, kind, amount, balance_after, description, created_at')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(30),
  )
  return { wallet, predictions, transactions }
}

export const adjustWallet = async (userId, amount, reason, key = newIdempotencyKey()) =>
  unwrap(
    await sb().rpc('admin_adjust_wallet', {
      p_user_id: userId,
      p_amount: Math.trunc(Number(amount)),
      p_reason: reason,
      p_idempotency_key: key,
    }),
  )

export const setRole = async (userId, role, reason) =>
  unwrap(await sb().rpc('admin_set_role', { p_user_id: userId, p_role: role, p_reason: reason }))
