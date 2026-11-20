-- =====================================================================
-- ON BETS — Múltipla não aceita duas apostas da mesma partida
-- ---------------------------------------------------------------------
-- Apostas da mesma partida são correlacionadas: "time X vence o jogo" e
-- "time X se classifica" dependem uma da outra. Multiplicar as odds como
-- se fossem independentes paga muito mais do que o risco real.
-- Regra (a mesma das casas de aposta): numa múltipla, no máximo UMA
-- aposta por partida. As duas continuam valendo como apostas simples.
--
-- Recria place_parlay igual à da migration 0008, com a checagem nova
-- no passo 4 (v_matches).
-- =====================================================================

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
  v_matches  uuid[] := '{}';
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

    -- apostas da mesma partida são correlacionadas: só uma por múltipla
    if v_event.match_id is not null then
      if v_event.match_id = any (v_matches) then
        raise exception 'Não dá para combinar duas apostas da mesma partida numa múltipla (%). Faça uma delas como aposta simples.', v_event.title;
      end if;
      v_matches := v_matches || v_event.match_id;
    end if;

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
