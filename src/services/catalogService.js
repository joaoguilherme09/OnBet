import { requireSupabase, unwrap } from './supabase'

const MATCH_FIELDS = `
  id, stage, scheduled_at, status, home_score, away_score, home_penalties, away_penalties,
  competition:competitions ( id, name ),
  home:teams!matches_home_team_id_fkey ( id, name, short_name, logo_url ),
  away:teams!matches_away_team_id_fkey ( id, name, short_name, logo_url )
`

/** Próximos confrontos (agendados a partir de agora). */
export async function getUpcomingMatches(limit = 6) {
  const sb = requireSupabase()
  return unwrap(
    await sb
      .from('matches')
      .select(MATCH_FIELDS)
      .eq('status', 'scheduled')
      .or(`scheduled_at.is.null,scheduled_at.gte.${new Date().toISOString()}`)
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(limit),
  )
}

/** Últimos resultados (partidas finalizadas). */
export async function getRecentResults(limit = 5) {
  const sb = requireSupabase()
  return unwrap(
    await sb
      .from('matches')
      .select(MATCH_FIELDS)
      .eq('status', 'finished')
      .order('updated_at', { ascending: false })
      .limit(limit),
  )
}

/** Campeonatos em andamento. */
export async function getOngoingCompetitions() {
  const sb = requireSupabase()
  return unwrap(
    await sb
      .from('competitions')
      .select('id, name, description, logo_url, starts_on, ends_on')
      .eq('status', 'ongoing')
      .order('starts_on', { ascending: false, nullsFirst: false }),
  )
}

const MATCH_WITH_EVENTS = `${MATCH_FIELDS.trim()},
  events:prediction_events ( id, status, closes_at, opens_at )
`

/** Partidas para a página Partidas. scope: 'upcoming' | 'finished' */
export async function getMatches({ scope = 'upcoming', competitionId, limit = 60 } = {}) {
  const sb = requireSupabase()
  let q = sb.from('matches').select(MATCH_WITH_EVENTS).limit(limit)
  if (competitionId) q = q.eq('competition_id', competitionId)
  if (scope === 'upcoming')
    q = q
      .in('status', ['scheduled', 'live'])
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
  else q = q.in('status', ['finished', 'cancelled']).order('updated_at', { ascending: false })
  return unwrap(await q)
}

export async function getCompetitions() {
  const sb = requireSupabase()
  return unwrap(
    await sb.from('competitions').select('id, name, status, starts_on, ends_on').order('created_at', { ascending: false }),
  )
}
