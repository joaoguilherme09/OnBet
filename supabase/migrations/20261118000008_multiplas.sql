-- =====================================================================
-- ON BETS — Múltiplas (palpites combinados)
-- ---------------------------------------------------------------------
-- Uma múltipla junta palpites de 2 a 10 eventos diferentes num só
-- bilhete. As odds se multiplicam e o valor é debitado uma vez.
--   * Se UM palpite errar, a múltipla inteira perde (payout 0).
--   * Se todos acertarem, paga floor(stake × odd total).
--   * Evento anulado: aquele palpite vale odd 1,00 (sai da conta).
--     Se todos forem anulados, o valor é devolvido.
-- Mesmas proteções dos palpites simples: odd congelada, chave de
-- idempotência, escrita só por função SECURITY DEFINER.
-- =====================================================================

create table public.parlays (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  stake             bigint not null check (stake > 0),
  total_odds        numeric(12,2) not null check (total_odds >= 1.01 and total_odds <= 1000000),
  potential_payout  bigint generated always as (floor(stake * total_odds)::bigint) stored,
  status            public.prediction_status not null default 'pending',
  payout            bigint not null default 0 check (payout >= 0),
  idempotency_key   uuid not null,
  created_at        timestamptz not null default now(),
  settled_at        timestamptz,
  constraint parlays_idempotency_key unique (user_id, idempotency_key),
  constraint parlays_payout_state check (
    (status = 'pending' and payout = 0 and settled_at is null)
    or (status = 'lost' and payout = 0 and settled_at is not null)
    -- com palpites anulados a odd efetiva cai, então o pagamento pode ser menor
    or (status = 'won'  and payout > 0 and payout <= potential_payout and settled_at is not null)
    or (status = 'void' and payout = stake and settled_at is not null)
  )
);
create index parlays_user_created_idx on public.parlays (user_id, created_at desc);

create table public.parlay_legs (
  parlay_id      uuid not null references public.parlays (id) on delete cascade,
  event_id       uuid not null references public.prediction_events (id) on delete restrict,
  option_id      uuid not null,
  odds_snapshot  numeric(6,2) not null check (odds_snapshot >= 1.01),
  status         public.prediction_status not null default 'pending',
  settled_at     timestamptz,
  -- um palpite por evento dentro da mesma múltipla
  primary key (parlay_id, event_id),
  constraint parlay_legs_option_fk foreign key (event_id, option_id)
    references public.prediction_options (event_id, id) on delete restrict,
  constraint parlay_legs_state check ((status = 'pending') = (settled_at is null))
);
create index parlay_legs_event_idx on public.parlay_legs (event_id, status);

-- ---------------------------------------------------------------------
-- Integridade: dados congelados, apuração uma única vez
-- ---------------------------------------------------------------------
create or replace function public.guard_parlay_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
  or new.stake is distinct from old.stake
  or new.total_odds is distinct from old.total_odds
  or new.idempotency_key is distinct from old.idempotency_key
  or new.created_at is distinct from old.created_at then
    raise exception 'Dados da múltipla não podem ser alterados' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' then
    raise exception 'Múltipla já apurada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger parlays_guard before update on public.parlays
  for each row execute function public.guard_parlay_update();

create or replace function public.guard_parlay_leg_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parlay_id is distinct from old.parlay_id
  or new.event_id is distinct from old.event_id
  or new.option_id is distinct from old.option_id
  or new.odds_snapshot is distinct from old.odds_snapshot then
    raise exception 'Dados do palpite da múltipla não podem ser alterados' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' then
    raise exception 'Palpite da múltipla já apurado' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger parlay_legs_guard before update on public.parlay_legs
  for each row execute function public.guard_parlay_leg_update();

-- ---------------------------------------------------------------------
-- RLS: cada um lê as próprias; admin lê tudo; ninguém escreve direto
-- ---------------------------------------------------------------------
alter table public.parlays     enable row level security;
alter table public.parlay_legs enable row level security;

create policy "parlays: ler as próprias ou admin"
  on public.parlays for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "parlay_legs: ler as próprias ou admin"
  on public.parlay_legs for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.parlays p where p.id = parlay_id and p.user_id = (select auth.uid()))
  );

revoke all on public.parlays, public.parlay_legs from anon, authenticated;
grant select on public.parlays, public.parlay_legs to authenticated;

-- ---------------------------------------------------------------------
-- Registrar múltipla
-- ---------------------------------------------------------------------
create or replace function public.place_parlay(
  p_option_ids      uuid[],
  p_stake           bigint,
  p_idempotency_key uuid
)
returns public.parlays
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_wallet   public.wallets;
  v_existing public.parlays;
  v_option   public.prediction_options;
  v_event    public.prediction_events;
  v_match    public.matches;
  v_settings public.app_settings;
  v_parlay   public.parlays;
  v_count    int;
  v_odds     numeric := 1;
  v_events   uuid[] := '{}';
  v_legs     jsonb := '[]'::jsonb;
  v_leg      jsonb;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para registrar palpites';
  end if;
  if p_idempotency_key is null then
    raise exception 'Requisição inválida: falta a chave de idempotência';
  end if;

  -- 1. trava a carteira
  select * into v_wallet from public.wallets where user_id = v_uid for update;
  if not found then
    raise exception 'Carteira não encontrada';
  end if;

  -- 2. mesmo clique reenviado → devolve a múltipla já registrada
  select * into v_existing from public.parlays
  where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  -- 3. quantidade de palpites
  v_count := coalesce(cardinality(p_option_ids), 0);
  if v_count < 2 then
    raise exception 'A múltipla precisa de pelo menos 2 palpites';
  end if;
  if v_count > 10 then
    raise exception 'A múltipla aceita no máximo 10 palpites';
  end if;
  if (select count(distinct x) from unnest(p_option_ids) x) <> v_count or array_position(p_option_ids, null) is not null then
    raise exception 'Palpites repetidos na múltipla';
  end if;

  -- 4. valida cada palpite (ordem fixa por evento evita deadlock com a apuração)
  for v_option in
    select o.* from public.prediction_options o
    where o.id = any (p_option_ids)
    order by o.event_id
  loop
    select * into v_event from public.prediction_events where id = v_option.event_id for share;

    if v_event.id = any (v_events) then
      raise exception 'Só vale um palpite por evento na múltipla (%)', v_event.title;
    end if;
    v_events := v_events || v_event.id;

    if v_event.status <> 'open' or now() < v_event.opens_at or now() >= v_event.closes_at then
      raise exception 'O evento "%" não está aceitando palpites', v_event.title;
    end if;
    if v_option.status <> 'active' then
      raise exception 'A opção "%" não está disponível', v_option.name;
    end if;
    if v_event.match_id is not null then
      select * into v_match from public.matches where id = v_event.match_id;
      if v_match.status <> 'scheduled'
         or (v_match.scheduled_at is not null and now() >= v_match.scheduled_at) then
        raise exception 'A partida de "%" já começou: palpites encerrados', v_event.title;
      end if;
    end if;

    v_odds := v_odds * v_option.odds;
    v_legs := v_legs || jsonb_build_object('event_id', v_event.id, 'option_id', v_option.id, 'odds', v_option.odds);
  end loop;

  if cardinality(v_events) <> v_count then
    raise exception 'Opção de palpite não encontrada';
  end if;

  v_odds := round(v_odds, 2);
  if v_odds > 1000000 then
    raise exception 'Odd total muito alta (máximo 1.000.000)';
  end if;

  -- 5. valor
  select * into v_settings from public.app_settings where id = 1;
  if p_stake is null or p_stake < v_settings.min_stake or p_stake > v_settings.max_stake then
    raise exception 'O valor do palpite precisa estar entre % e % ON Coins',
      v_settings.min_stake, v_settings.max_stake;
  end if;
  if v_wallet.balance < p_stake then
    raise exception 'Saldo insuficiente: você tem % ON Coins', v_wallet.balance;
  end if;

  -- 6. grava tudo
  insert into public.parlays (user_id, stake, total_odds, idempotency_key)
  values (v_uid, p_stake, v_odds, p_idempotency_key)
  returning * into v_parlay;

  for v_leg in select * from jsonb_array_elements(v_legs) loop
    insert into public.parlay_legs (parlay_id, event_id, option_id, odds_snapshot)
    values (v_parlay.id, (v_leg ->> 'event_id')::uuid, (v_leg ->> 'option_id')::uuid, (v_leg ->> 'odds')::numeric);
  end loop;

  update public.wallets set balance = balance - p_stake where id = v_wallet.id;

  insert into public.transactions (wallet_id, type, kind, amount, balance_after, description, reference_id)
  values (
    v_wallet.id, 'debit', 'stake', p_stake, v_wallet.balance - p_stake,
    'Múltipla: ' || v_count || ' palpites @ ' || v_odds,
    v_parlay.id
  );

  return v_parlay;
end;
$$;

revoke execute on function public.place_parlay(uuid[], bigint, uuid) from public, anon;
grant execute on function public.place_parlay(uuid[], bigint, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Fecha a múltipla quando possível (uso interno da apuração)
-- ---------------------------------------------------------------------
create or replace function public._resolve_parlay(p_parlay_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parlay  public.parlays;
  v_lost    int;
  v_pending int;
  v_won     int;
  v_odds    numeric;
  v_leg_odds numeric;
  v_payout  bigint;
begin
  select * into v_parlay from public.parlays where id = p_parlay_id for update;
  if v_parlay.status <> 'pending' then
    return v_parlay.status::text;
  end if;

  select count(*) filter (where status = 'lost'),
         count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'won')
    into v_lost, v_pending, v_won
  from public.parlay_legs where parlay_id = p_parlay_id;

  -- um erro derruba a múltipla na hora, mesmo com outros jogos pendentes
  if v_lost > 0 then
    update public.parlays set status = 'lost', payout = 0, settled_at = now() where id = p_parlay_id;
    return 'lost';
  end if;

  if v_pending > 0 then
    return 'pending';
  end if;

  if v_won = 0 then
    update public.parlays set status = 'void', payout = v_parlay.stake, settled_at = now() where id = p_parlay_id;
    perform public._wallet_move(v_parlay.user_id, 'credit', 'refund', v_parlay.stake,
      'Múltipla anulada: todos os eventos foram anulados', p_parlay_id, null);
    return 'void';
  end if;

  -- produto exato das odds acertadas (anuladas valem 1,00)
  v_odds := 1;
  for v_leg_odds in
    select odds_snapshot from public.parlay_legs where parlay_id = p_parlay_id and status = 'won'
  loop
    v_odds := v_odds * v_leg_odds;
  end loop;
  v_odds := round(v_odds, 2);

  v_payout := least(floor(v_parlay.stake * v_odds)::bigint, v_parlay.potential_payout);
  update public.parlays set status = 'won', payout = v_payout, settled_at = now() where id = p_parlay_id;
  perform public._wallet_move(v_parlay.user_id, 'credit', 'payout', v_payout,
    'Múltipla vencedora: ' || v_won || ' acertos @ ' || v_odds, p_parlay_id, null);
  return 'won';
end;
$$;

-- Apura os palpites de múltiplas de um evento. p_winning_option_id nulo = evento anulado.
create or replace function public._settle_parlay_legs(p_event_id uuid, p_winning_option_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg    record;
  v_result text;
  v_legs   int := 0;
  v_won    int := 0;
  v_lost   int := 0;
begin
  for v_leg in
    select l.parlay_id, l.option_id
    from public.parlay_legs l
    join public.parlays p on p.id = l.parlay_id
    where l.event_id = p_event_id and l.status = 'pending'
    order by p.user_id, p.created_at
  loop
    update public.parlay_legs
      set status = case when p_winning_option_id is null then 'void'::public.prediction_status
                        when v_leg.option_id = p_winning_option_id then 'won'::public.prediction_status
                        else 'lost'::public.prediction_status end,
          settled_at = now()
      where parlay_id = v_leg.parlay_id and event_id = p_event_id;
    v_legs := v_legs + 1;

    v_result := public._resolve_parlay(v_leg.parlay_id);
    if v_result = 'won' then v_won := v_won + 1; end if;
    if v_result = 'lost' then v_lost := v_lost + 1; end if;
  end loop;

  return json_build_object('parlay_legs', v_legs, 'parlays_won', v_won, 'parlays_lost', v_lost);
end;
$$;

-- ---------------------------------------------------------------------
-- Apuração e anulação passam a resolver também as múltiplas
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
  v_parlays json;
begin
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

  v_parlays := public._settle_parlay_legs(p_event_id, p_winning_option_id);

  update public.prediction_events
    set status = 'settled', winning_option_id = p_winning_option_id,
        settled_at = now(), settled_by = v_admin
    where id = p_event_id;

  perform set_config('onbets.settling', 'off', true);

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (v_admin, 'event.settle', 'prediction_events', p_event_id,
          json_build_object('winning_option_id', p_winning_option_id, 'winning_option', v_option.name,
                            'winners', v_winners, 'losers', v_losers, 'total_paid', v_paid,
                            'parlays', v_parlays)::jsonb);

  return json_build_object('winners', v_winners, 'losers', v_losers, 'total_paid', v_paid,
                           'parlay_legs', v_parlays -> 'parlay_legs',
                           'parlays_won', v_parlays -> 'parlays_won',
                           'parlays_lost', v_parlays -> 'parlays_lost');
end;
$$;

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
  v_parlays  json;
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

  v_parlays := public._settle_parlay_legs(p_event_id, null);

  update public.prediction_events
    set status = 'void', winning_option_id = null, settled_at = now(),
        settled_by = v_admin, void_reason = left(trim(p_reason), 300)
    where id = p_event_id;

  perform set_config('onbets.settling', 'off', true);

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details, reason)
  values (v_admin, 'event.void', 'prediction_events', p_event_id,
          json_build_object('refunded', v_refunded, 'total_refunded', v_total, 'parlays', v_parlays)::jsonb,
          trim(p_reason));

  return json_build_object('refunded', v_refunded, 'total_refunded', v_total,
                           'parlay_legs', v_parlays -> 'parlay_legs');
end;
$$;

-- ---------------------------------------------------------------------
-- Estatísticas pessoais contam cada múltipla como um palpite
-- ---------------------------------------------------------------------
create or replace function public.get_my_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select status, stake, payout, odds_snapshot as odds from public.predictions where user_id = auth.uid()
    union all
    select status, stake, payout, total_odds from public.parlays where user_id = auth.uid()
  )
  select json_build_object(
    'total',    count(*),
    'pending',  count(*) filter (where status = 'pending'),
    'won',      count(*) filter (where status = 'won'),
    'lost',     count(*) filter (where status = 'lost'),
    'void',     count(*) filter (where status = 'void'),
    'staked',   coalesce(sum(stake), 0),
    'staked_settled', coalesce(sum(stake) filter (where status <> 'pending'), 0),
    'returned', coalesce(sum(payout) filter (where status in ('won', 'void')), 0),
    'hit_rate', case when count(*) filter (where status in ('won', 'lost')) = 0 then null
                     else round(100.0 * count(*) filter (where status = 'won')
                                / count(*) filter (where status in ('won', 'lost')), 1) end,
    'best_odds_won', max(odds) filter (where status = 'won')
  )
  from mine;
$$;

revoke execute on function
  public.guard_parlay_update(),
  public.guard_parlay_leg_update(),
  public._resolve_parlay(uuid),
  public._settle_parlay_legs(uuid, uuid)
from public, anon, authenticated;
