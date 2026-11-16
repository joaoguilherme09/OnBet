-- =====================================================================
-- ON BETS — Fase 3: carteira virtual
-- ---------------------------------------------------------------------
-- * Todo perfil novo ganha carteira + crédito inicial (app_settings).
-- * Perfis já existentes recebem a carteira agora (backfill).
-- * Resumo da carteira via RPC; saldo em tempo real via Realtime.
-- =====================================================================

-- Cria a carteira de um usuário com o crédito inicial. Idempotente.
create or replace function public.create_wallet_for(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_initial bigint;
  v_wallet  uuid;
begin
  select id into v_wallet from public.wallets where user_id = p_user_id;
  if found then
    return v_wallet;
  end if;

  select initial_balance into v_initial from public.app_settings where id = 1;
  v_initial := coalesce(v_initial, 0);

  insert into public.wallets (user_id, balance)
  values (p_user_id, v_initial)
  returning id into v_wallet;

  if v_initial > 0 then
    insert into public.transactions (wallet_id, type, kind, amount, balance_after, description)
    values (v_wallet, 'credit', 'initial_credit', v_initial, v_initial, 'Crédito inicial de boas-vindas');
  end if;

  return v_wallet;
end;
$$;

create or replace function public.profiles_create_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_wallet_for(new.id);
  return new;
end;
$$;

create trigger profiles_create_wallet
  after insert on public.profiles
  for each row execute function public.profiles_create_wallet();

revoke execute on function public.create_wallet_for(uuid) from public, anon, authenticated;
revoke execute on function public.profiles_create_wallet() from public, anon, authenticated;

-- Backfill: quem se cadastrou nas fases 1–2 ganha carteira agora.
select public.create_wallet_for(p.id)
from public.profiles p
where not exists (select 1 from public.wallets w where w.user_id = p.id);

-- ---------------------------------------------------------------------
-- Resumo da carteira do usuário logado
-- ---------------------------------------------------------------------
create or replace function public.get_wallet_summary()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'wallet_id',      w.id,
    'balance',        w.balance,
    'total_received', coalesce(sum(t.amount) filter (where t.type = 'credit'), 0),
    'total_staked',   coalesce(sum(t.amount) filter (where t.kind = 'stake'), 0),
    'total_returned', coalesce(sum(t.amount) filter (where t.kind in ('payout', 'refund')), 0),
    'pending_stake',  (select coalesce(sum(p.stake), 0) from public.predictions p
                       where p.user_id = w.user_id and p.status = 'pending'),
    'updated_at',     w.updated_at
  )
  from public.wallets w
  left join public.transactions t on t.wallet_id = w.id
  where w.user_id = auth.uid()
  group by w.id;
$$;

revoke execute on function public.get_wallet_summary() from public, anon;
grant execute on function public.get_wallet_summary() to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: o navegador recebe mudanças da própria carteira
-- (a RLS de leitura continua valendo para o Realtime).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wallets;
  end if;
end;
$$;
