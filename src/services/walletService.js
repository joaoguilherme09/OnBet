import { requireSupabase, unwrap } from './supabase'

export async function getWalletSummary() {
  const sb = requireSupabase()
  return unwrap(await sb.rpc('get_wallet_summary'))
}

/** Extrato paginado (mais recentes primeiro). A RLS só devolve o do próprio usuário. */
export async function getTransactions({ limit = 20, before } = {}) {
  const sb = requireSupabase()
  let q = sb
    .from('transactions')
    .select('id, type, kind, amount, balance_after, description, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)
  return unwrap(await q)
}

/** Avisa quando a carteira do usuário muda (Realtime). Retorna função para cancelar. */
export function subscribeWallet(userId, onChange) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`wallet:${userId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, (p) =>
      onChange(p.new),
    )
    .subscribe()
  return () => sb.removeChannel(channel)
}

export const TRANSACTION_LABEL = {
  initial_credit: 'Crédito inicial',
  stake: 'Palpite registrado',
  payout: 'Palpite vencedor',
  refund: 'Devolução',
  admin_adjustment: 'Ajuste administrativo',
}
