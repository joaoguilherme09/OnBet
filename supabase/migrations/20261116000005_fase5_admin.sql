-- =====================================================================
-- ON BETS — Fase 5: administração, apuração e auditoria
-- ---------------------------------------------------------------------
-- Toda função aqui exige papel admin e grava em admin_audit_log.
-- =====================================================================

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem fazer isso' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Ajustes administrativos com chave de idempotência não se repetem.
create unique index transactions_admin_adjust_once
  on public.transactions (reference_id)
  where kind = 'admin_adjustment' and reference_id is not null;

-- ---------------------------------------------------------------------
-- Credita/debita uma carteira (uso interno das funções abaixo)
-- ---------------------------------------------------------------------
create or replace function public._wallet_move(
  p_user_id     uuid,
  p_type        public.transaction_type,
  p_kind        public.transaction_kind,
  p_amount      bigint,
  p_description text,
  p_reference   uuid,
  p_created_by  uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets;
  v_after  bigint;
begin
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then
    raise exception 'Carteira não encontrada';
  end if;

  v_after := case when p_type = 'credit' then v_wallet.balance + p_amount
                  else v_wallet.balance - p_amount end;
  if v_after < 0 then
    raise exception 'Saldo insuficiente: a carteira tem % ON Coins', v_wallet.balance;
  end if;

  update public.wallets set balance = v_after where id = v_wallet.id;
  insert into public.transactions (wallet_id, type, kind, amount, balance_after, description, reference_id, created_by)
  values (v_wallet.id, p_type, p_kind, p_amount, v_after, left(p_description, 300), p_reference, p_created_by);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------
-- Apuração: uma única vez por evento
-- ---------------------------------------------------------------------
create or replace function public.settle_event(p_event_id uuid, p_winning_option_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin   uuid := public.require_admin();
  v_event   public.prediction_events;
  v_option  public.prediction_options;
  v_pred    record;
  v_winners int := 0;
  v_losers  int := 0;
  v_paid    bigint := 0;
begin
  -- trava o evento: palpites em andamento terminam antes; nenhum novo entra
  select * into v_event from public.prediction_events where id = p_event_id for update;
  if not found then
    raise exception 'Evento não encontrado';
  end if;
  if v_event.status not in ('open', 'closed') then
    raise exception 'Evento já apurado ou anulado (status: %)', v_event.status;
  end if;

  select * into v_option from public.prediction_options
  where id = p_winning_option_id and event_id = p_event_id;
  if not found then
    raise exception 'A opção vencedora não pertence a este evento';
  end if;

  perform set_config('onbets.settling', 'on', true);

  -- ordem fixa por usuário evita deadlock entre carteiras
  for v_pred in
    select * from public.predictions
    where event_id = p_event_id and status = 'pending'
    order by user_id, created_at
  loop
    if v_pred.option_id = p_winning_option_id then
      update public.predictions
        set status = 'won', payout = v_pred.potential_payout, settled_at = now()
        where id = v_pred.id;
      perform public._wallet_move(
        v_pred.user_id, 'credit', 'payout', v_pred.potential_payout,
        'Palpite vencedor: ' || v_event.title || ' (' || v_option.name || ' @ ' || v_pred.odds_snapshot || ')',
        v_pred.id, null);
      v_winners := v_winners + 1;
      v_paid := v_paid + v_pred.potential_payout;
    else
      update public.predictions
        set status = 'lost', payout = 0, settled_at = now()
        where id = v_pred.id;
      v_losers := v_losers + 1;
    end if;
  end loop;

  update public.prediction_events
    set status = 'settled', winning_option_id = p_winning_option_id,
        settled_at = now(), settled_by = v_admin
    where id = p_event_id;

  perform set_config('onbets.settling', 'off', true);

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (v_admin, 'event.settle', 'prediction_events', p_event_id,
          json_build_object('winning_option_id', p_winning_option_id, 'winning_option', v_option.name,
                            'winners', v_winners, 'losers', v_losers, 'total_paid', v_paid)::jsonb);

  return json_build_object('winners', v_winners, 'losers', v_losers, 'total_paid', v_paid);
end;
$$;

-- ---------------------------------------------------------------------
-- Anulação: devolve exatamente o valor de cada palpite
-- ---------------------------------------------------------------------
create or replace function public.void_event(p_event_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    uuid := public.require_admin();
  v_event    public.prediction_events;
  v_pred     record;
  v_refunded int := 0;
  v_total    bigint := 0;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Informe o motivo da anulação (mínimo 5 caracteres)';
  end if;

  select * into v_event from public.prediction_events where id = p_event_id for update;
  if not found then
    raise exception 'Evento não encontrado';
  end if;
  if v_event.status in ('settled', 'void') then
    raise exception 'Evento já apurado ou anulado (status: %)', v_event.status;
  end if;

  perform set_config('onbets.settling', 'on', true);

  for v_pred in
    select * from public.predictions
    where event_id = p_event_id and status = 'pending'
    order by user_id, created_at
  loop
    update public.predictions
      set status = 'void', payout = v_pred.stake, settled_at = now()
      where id = v_pred.id;
    perform public._wallet_move(
      v_pred.user_id, 'credit', 'refund', v_pred.stake,
      'Evento anulado: ' || v_event.title, v_pred.id, null);
    v_refunded := v_refunded + 1;
    v_total := v_total + v_pred.stake;
  end loop;

  update public.prediction_events
    set status = 'void', winning_option_id = null, settled_at = now(),
        settled_by = v_admin, void_reason = left(trim(p_reason), 300)
    where id = p_event_id;

  perform set_config('onbets.settling', 'off', true);

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details, reason)
  values (v_admin, 'event.void', 'prediction_events', p_event_id,
          json_build_object('refunded', v_refunded, 'total_refunded', v_total)::jsonb, trim(p_reason));

  return json_build_object('refunded', v_refunded, 'total_refunded', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- Ajuste manual de ON Coins (positivo = crédito, negativo = débito)
-- ---------------------------------------------------------------------
create or replace function public.admin_adjust_wallet(
  p_user_id         uuid,
  p_amount          bigint,
  p_reason          text,
  p_idempotency_key uuid
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid := public.require_admin();
  v_before bigint;
  v_after  bigint;
  v_done   public.transactions;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'Informe um valor diferente de zero';
  end if;
  if abs(p_amount) > 1000000 then
    raise exception 'Valor muito alto para um ajuste (máximo 1.000.000)';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Informe a justificativa (mínimo 5 caracteres)';
  end if;
  if p_idempotency_key is null then
    raise exception 'Requisição inválida: falta a chave de idempotência';
  end if;

  select * into v_done from public.transactions
  where kind = 'admin_adjustment' and reference_id = p_idempotency_key;
  if found then
    return json_build_object('balance', v_done.balance_after, 'repeated', true);
  end if;

  select balance into v_before from public.wallets where user_id = p_user_id;
  if not found then
    raise exception 'Participante não encontrado';
  end if;

  v_after := public._wallet_move(
    p_user_id,
    case when p_amount > 0 then 'credit'::public.transaction_type else 'debit'::public.transaction_type end,
    'admin_adjustment', abs(p_amount),
    'Ajuste administrativo: ' || trim(p_reason),
    p_idempotency_key, v_admin);

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details, reason)
  values (v_admin, 'wallet.adjust', 'wallets', p_user_id,
          json_build_object('amount', p_amount, 'balance_before', v_before, 'balance_after', v_after)::jsonb,
          trim(p_reason));

  return json_build_object('balance', v_after, 'repeated', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Configurações (saldo inicial, limites de palpite)
-- ---------------------------------------------------------------------
create or replace function public.admin_update_settings(
  p_initial_balance bigint,
  p_min_stake       bigint,
  p_max_stake       bigint
)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_old   public.app_settings;
  v_new   public.app_settings;
begin
  select * into v_old from public.app_settings where id = 1;
  update public.app_settings
    set initial_balance = p_initial_balance, min_stake = p_min_stake,
        max_stake = p_max_stake, updated_by = v_admin
    where id = 1
    returning * into v_new;

  insert into public.admin_audit_log (admin_id, action, target_table, details)
  values (v_admin, 'settings.update', 'app_settings',
          json_build_object('before', row_to_json(v_old), 'after', row_to_json(v_new))::jsonb);
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- Promover / rebaixar administradores
-- ---------------------------------------------------------------------
create or replace function public.admin_set_role(p_user_id uuid, p_role public.user_role, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_old   public.user_role;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Informe a justificativa (mínimo 5 caracteres)';
  end if;
  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Participante não encontrado';
  end if;
  if v_old = p_role then
    return;
  end if;
  if v_old = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'A plataforma precisa ter pelo menos um administrador';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details, reason)
  values (v_admin, 'profile.role', 'profiles', p_user_id,
          json_build_object('before', v_old, 'after', p_role)::jsonb, trim(p_reason));
end;
$$;

-- ---------------------------------------------------------------------
-- Leituras do painel
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return json_build_object(
    'participants',     (select count(*) from public.profiles),
    'events_total',     (select count(*) from public.prediction_events),
    'events_open',      (select count(*) from public.prediction_events where status = 'open' and closes_at > now()),
    'events_closed',    (select count(*) from public.prediction_events
                          where status = 'closed' or (status = 'open' and closes_at <= now())),
    'events_settled',   (select count(*) from public.prediction_events where status in ('settled', 'void')),
    'predictions',      (select count(*) from public.predictions),
    'predictions_pending', (select count(*) from public.predictions where status = 'pending'),
    'coins_staked',     (select coalesce(sum(stake), 0) from public.predictions),
    'coins_paid',       (select coalesce(sum(payout), 0) from public.predictions where status = 'won'),
    'coins_in_wallets', (select coalesce(sum(balance), 0) from public.wallets)
  );
end;
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, username text, full_name text, email text, role public.user_role,
  balance bigint, predictions bigint, wins bigint, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select p.id, p.username, p.full_name, u.email::text, p.role,
           coalesce(w.balance, 0),
           (select count(*) from public.predictions x where x.user_id = p.id),
           (select count(*) from public.predictions x where x.user_id = p.id and x.status = 'won'),
           p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.wallets w on w.user_id = p.id
    where p_search is null or p_search = ''
       or p.username ilike '%' || p_search || '%'
       or u.email ilike '%' || p_search || '%'
       or p.full_name ilike '%' || p_search || '%'
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- Exposição por opção (quanto seria pago se cada opção vencesse)
create or replace function public.admin_event_summary(p_event_id uuid)
returns table (option_id uuid, name text, odds numeric, predictions bigint, total_stake bigint, potential_payout bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select o.id, o.name, o.odds,
           count(p.id),
           coalesce(sum(p.stake), 0)::bigint,
           coalesce(sum(p.potential_payout), 0)::bigint
    from public.prediction_options o
    left join public.predictions p on p.option_id = o.id
    where o.event_id = p_event_id
    group by o.id
    order by o.sort_order, o.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Auditoria automática de mudanças feitas direto nas tabelas do catálogo
-- (odds, status/prazo de eventos, placar de partidas)
-- ---------------------------------------------------------------------
-- (um gatilho por tabela: o PL/pgSQL não aceita ler NEW.coluna que não existe)
create or replace function public._audit(p_action text, p_table text, p_target uuid, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  select auth.uid(), p_action, p_table, p_target, p_details
  -- mudanças feitas pelas funções de apuração já são auditadas por elas
  where coalesce(current_setting('onbets.settling', true), '') <> 'on';
$$;

create or replace function public.audit_option_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.odds is distinct from old.odds then
    perform public._audit('option.odds', 'prediction_options', new.id,
      jsonb_build_object('event_id', new.event_id, 'name', new.name, 'before', old.odds, 'after', new.odds));
  end if;
  if new.status is distinct from old.status then
    perform public._audit('option.status', 'prediction_options', new.id,
      jsonb_build_object('event_id', new.event_id, 'name', new.name, 'before', old.status, 'after', new.status));
  end if;
  return new;
end;
$$;

create or replace function public.audit_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.closes_at is distinct from old.closes_at then
    perform public._audit('event.update', 'prediction_events', new.id,
      jsonb_build_object('title', new.title,
        'status', jsonb_build_object('before', old.status, 'after', new.status),
        'closes_at', jsonb_build_object('before', old.closes_at, 'after', new.closes_at)));
  end if;
  return new;
end;
$$;

create or replace function public.audit_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.home_score is distinct from old.home_score
     or new.away_score is distinct from old.away_score or new.scheduled_at is distinct from old.scheduled_at then
    perform public._audit('match.update', 'matches', new.id,
      jsonb_build_object(
        'status', jsonb_build_object('before', old.status, 'after', new.status),
        'score', jsonb_build_object('before', concat(old.home_score, 'x', old.away_score),
                                    'after', concat(new.home_score, 'x', new.away_score)),
        'scheduled_at', jsonb_build_object('before', old.scheduled_at, 'after', new.scheduled_at)));
  end if;
  return new;
end;
$$;

create trigger prediction_options_audit after update on public.prediction_options
  for each row execute function public.audit_option_change();
create trigger prediction_events_audit after update on public.prediction_events
  for each row execute function public.audit_event_change();
create trigger matches_audit after update on public.matches
  for each row execute function public.audit_match_change();

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.require_admin(),
  public._wallet_move(uuid, public.transaction_type, public.transaction_kind, bigint, text, uuid, uuid),
  public._audit(text, text, uuid, jsonb),
  public.audit_option_change(),
  public.audit_event_change(),
  public.audit_match_change()
from public, anon, authenticated;

revoke execute on function
  public.settle_event(uuid, uuid),
  public.void_event(uuid, text),
  public.admin_adjust_wallet(uuid, bigint, text, uuid),
  public.admin_update_settings(bigint, bigint, bigint),
  public.admin_set_role(uuid, public.user_role, text),
  public.admin_dashboard_stats(),
  public.admin_list_users(text, int, int),
  public.admin_event_summary(uuid)
from public, anon;

grant execute on function
  public.settle_event(uuid, uuid),
  public.void_event(uuid, text),
  public.admin_adjust_wallet(uuid, bigint, text, uuid),
  public.admin_update_settings(bigint, bigint, bigint),
  public.admin_set_role(uuid, public.user_role, text),
  public.admin_dashboard_stats(),
  public.admin_list_users(text, int, int),
  public.admin_event_summary(uuid)
to authenticated;
