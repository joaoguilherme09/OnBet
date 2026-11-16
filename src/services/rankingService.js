import { requireSupabase, unwrap } from './supabase'

export async function getRanking(limit = 100) {
  const sb = requireSupabase()
  return unwrap(await sb.rpc('get_ranking', { p_limit: limit }))
}

export async function getMyRank() {
  const sb = requireSupabase()
  return unwrap(await sb.rpc('get_my_rank'))
}

export async function getHighlights(days = 30, limit = 5) {
  const sb = requireSupabase()
  return unwrap(await sb.rpc('get_highlights', { p_days: days, p_limit: limit }))
}
