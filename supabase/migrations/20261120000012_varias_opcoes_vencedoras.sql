-- =====================================================================
-- ON BETS — Evento com mais de uma opção vencedora
-- ---------------------------------------------------------------------
-- Em alguns mercados várias opções batem ao mesmo tempo. Ex.: "+/- gols
-- na partida" com placar 3x2 (5 gols): +0.5 até +4.5 batem, e -5.5 até
-- -7.5 também.
--
-- - prediction_events.winning_option_ids guarda todas as vencedoras.
--   winning_option_id continua existindo (é a primeira da lista), para
--   manter as travas e a chave estrangeira de antes.
-- - settle_event_multi(evento, opções[]) apura com várias vencedoras.
--   settle_event(evento, opção) continua funcionando e chama a nova.
-- - Eventos apurados antes desta migration ficam com a lista nula: o app
--   usa winning_option_id nesses casos.
-- =====================================================================

alter table public.prediction_events
  add column winning_option_ids uuid[];

alter table public.prediction_events
  add constraint events_winners_list check (
    winning_option_ids is null
    or (status = 'settled' and cardinality(winning_option_ids) >= 1 and winning_option_id = winning_option_ids[1])
  );

-- ---------------------------------------------------------------------
-- Travas: a lista de vencedoras também só muda pela apuração oficial
-- ---------------------------------------------------------------------
create or replace function public.guard_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_settling boolean := coalesce(current_setting('onbets.settling', true), '') = 'on';
begin
  if v_settling then
    return new;
  end if;

  if old.status in ('settled', 'void') then
    raise exception 'Evento já apurado ou anulado não pode ser alterado' using errcode = 'P0001';
  end if;

  if new.status in ('settled', 'void')
  or new.winning_option_id  is distinct from old.winning_option_id
  or new.winning_option_ids is distinct from old.winning_option_ids
  or new.settled_at         is distinct from old.settled_at
  or new.settled_by         is distinct from old.settled_by then
    raise exception 'Use a função de apuração para encerrar o evento' using errcode = 'P0001';
  end if;

  if new.category is distinct from old.category
  and exists (select 1 from public.predictions p where p.event_id = old.id) then
    raise exception 'Categoria não pode mudar depois de receber palpites' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.guard_event_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('settled', 'void') or new.winning_option_id is not null or new.winning_option_ids is not null then
    raise exception 'Evento não pode nascer apurado' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Múltiplas: apura os palpites de um evento com várias vencedoras.
-- p_winning_option_ids nulo = evento anulado.
-- ---------------------------------------------------------------------
create or replace function public._settle_parlay_legs_multi(p_event_id uuid, p_winning_option_ids uuid[])
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
      set status = case when p_winning_option_ids is null then 'void'::public.prediction_status
                        when v_leg.option_id = any (p_winning_option_ids) then 'won'::public.prediction_status
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

-- a versão antiga (usada pela anulação) passa a chamar a nova
create or replace function public._settle_parlay_legs(p_event_id uuid, p_winning_option_id uuid)
returns json
language sql
security definer
set search_path = ''
as $$
  select public._settle_parlay_legs_multi(
    p_event_id,
    case when p_winning_option_id is null then null else array[p_winning_option_id] end
  );
$$;

-- ---------------------------------------------------------------------
-- Apuração com uma ou mais opções vencedoras
-- ---------------------------------------------------------------------
create or replace function public.settle_event_multi(p_event_id uuid, p_winning_option_ids uuid[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin   uuid := public.require_admin();
  v_event   public.prediction_events;
  v_ids     uuid[];
  v_names   text[];
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

  -- sem repetidas e na ordem das opções do evento
  select array_agg(o.id order by o.sort_order, o.name), array_agg(o.name order by o.sort_order, o.name)
    into v_ids, v_names
  from public.prediction_options o
  where o.event_id = p_event_id and o.id = any (coalesce(p_winning_option_ids, '{}'));

  if v_ids is null then
    raise exception 'Escolha pelo menos uma opção vencedora';
  end if;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(p_winning_option_ids) x) then
    raise exception 'Alguma opção vencedora não pertence a este evento';
  end if;

  perform set_config('onbets.settling', 'on', true);

  for v_pred in
    select p.*, o.name as option_name
    from public.predictions p
    join public.prediction_options o on o.id = p.option_id
    where p.event_id = p_event_id and p.status = 'pending'
    order by p.user_id, p.created_at
  loop
    if v_pred.option_id = any (v_ids) then
      update public.predictions
        set status = 'won', payout = v_pred.potential_payout, settled_at = now()
        where id = v_pred.id;
      perform public._wallet_move(
        v_pred.user_id, 'credit', 'payout', v_pred.potential_payout,
        'Palpite vencedor: ' || v_event.title || ' (' || v_pred.option_name || ' @ ' || v_pred.odds_snapshot || ')',
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

  v_parlays := public._settle_parlay_legs_multi(p_event_id, v_ids);

  update public.prediction_events
    set status = 'settled', winning_option_id = v_ids[1], winning_option_ids = v_ids,
        settled_at = now(), settled_by = v_admin
    where id = p_event_id;

  perform set_config('onbets.settling', 'off', true);

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (v_admin, 'event.settle', 'prediction_events', p_event_id,
          json_build_object('winning_option_id', v_ids[1], 'winning_option', array_to_string(v_names, ', '),
                            'winning_option_ids', v_ids,
                            'winners', v_winners, 'losers', v_losers, 'total_paid', v_paid,
                            'parlays', v_parlays)::jsonb);

  return json_build_object('winners', v_winners, 'losers', v_losers, 'total_paid', v_paid,
                           'parlay_legs', v_parlays -> 'parlay_legs',
                           'parlays_won', v_parlays -> 'parlays_won',
                           'parlays_lost', v_parlays -> 'parlays_lost');
end;
$$;

-- a função antiga (uma vencedora) continua valendo
create or replace function public.settle_event(p_event_id uuid, p_winning_option_id uuid)
returns json
language sql
security definer
set search_path = ''
as $$
  select public.settle_event_multi(p_event_id, array[p_winning_option_id]);
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public._settle_parlay_legs_multi(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.settle_event_multi(uuid, uuid[]) from public, anon;
grant execute on function public.settle_event_multi(uuid, uuid[]) to authenticated;
