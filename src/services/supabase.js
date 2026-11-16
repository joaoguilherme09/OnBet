import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** true quando as variáveis de ambiente foram preenchidas. */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Cliente único do Supabase. Usa apenas a chave anon (pública):
 * quem decide o que cada usuário pode ler/escrever é a RLS do banco.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

/** Lança erro amigável quando o projeto ainda não foi configurado. */
export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado: preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local')
  }
  return supabase
}

/** Converte o retorno { data, error } do Supabase em valor ou exceção. */
export function unwrap({ data, error }) {
  if (error) throw new Error(translateError(error))
  return data
}

const CONSTRAINT_MESSAGES = {
  events_window: 'O encerramento precisa ser depois da abertura.',
  events_match_link: 'Escolha a partida deste evento.',
  events_competition_link: 'Escolha o campeonato deste evento.',
  events_milestone_rules: 'Marcos históricos precisam ter as regras preenchidas.',
  matches_distinct_teams: 'Mandante e visitante precisam ser times diferentes.',
  matches_score_when_finished: 'Informe o placar para finalizar a partida.',
  prediction_options_odds_check: 'A odd precisa estar entre 1,01 e 1000.',
  prediction_options_name_per_event: 'Já existe uma opção com esse nome neste evento.',
  teams_name_lower_key: 'Já existe um time com esse nome.',
  competitions_dates: 'A data final precisa ser depois da inicial.',
  app_settings_stake_range: 'O valor máximo precisa ser maior ou igual ao mínimo.',
  profiles_username_lower_key: 'Este nome de usuário já está em uso.',
}

export function translateError(error) {
  const msg = error?.message ?? ''
  // Erros lançados pelas nossas funções SQL já vêm em português.
  if (error?.code === 'P0001') return msg
  if (error?.code === '42501') return msg.startsWith('Apenas') ? msg : 'Você não tem permissão para fazer isso.'
  for (const [name, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (msg.includes(name) || error?.details?.includes?.(name)) return text
  }
  if (error?.code === '23505') return 'Já existe um registro com esses dados.'
  if (error?.code === '23503' || error?.code === '23001') return 'Este registro está em uso por outros dados e não pode ser removido.'
  if (error?.code === '23514') return 'Dados inválidos. Confira os campos.'
  if (msg.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique sua internet.'
  return msg || 'Erro inesperado.'
}

/** Gera uma chave de idempotência (uma por clique de confirmar). */
export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
