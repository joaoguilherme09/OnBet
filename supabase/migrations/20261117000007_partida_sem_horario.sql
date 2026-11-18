-- =====================================================================
-- ON BETS — Partidas sem data e horário
-- ---------------------------------------------------------------------
-- O admin não sabe quando os jogadores vão jogar: dá um prazo, e esse
-- prazo é o "fecha em" do evento de palpites. A partida deixa de exigir
-- data, e o palpite fica bloqueado quando:
--   - o prazo do evento acabou, ou
--   - a partida não está mais "agendada" (ao vivo, finalizada, cancelada), ou
--   - a partida tem horário preenchido (partidas antigas) e ele já passou.
-- =====================================================================

alter table public.matches alter column scheduled_at drop not null;

create or replace function public.place_prediction(
  p_option_id       uuid,
  p_stake           bigint,
  p_idempotency_key uuid
)
returns public.predictions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_wallet   public.wallets;
  v_existing public.predictions;
  v_option   public.prediction_options;
  v_event    public.prediction_events;
  v_match    public.matches;
  v_settings public.app_settings;
  v_pred     public.predictions;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para registrar palpites';
  end if;
  if p_idempotency_key is null then
    raise exception 'Requisição inválida: falta a chave de idempotência';
  end if;

  -- 1. trava a carteira: serializa palpites simultâneos do mesmo usuário
  select * into v_wallet from public.wallets where user_id = v_uid for update;
  if not found then
    raise exception 'Carteira não encontrada';
  end if;

  -- 2. mesmo clique reenviado → devolve o palpite já registrado
  select * into v_existing
  from public.predictions
  where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  -- 3. opção e evento (FOR SHARE: a apuração espera este palpite terminar)
  select * into v_option from public.prediction_options where id = p_option_id;
  if not found then
    raise exception 'Opção de palpite não encontrada';
  end if;

  select * into v_event from public.prediction_events where id = v_option.event_id for share;

  if v_event.status <> 'open' then
    raise exception 'Este evento não está aberto para palpites';
  end if;
  if now() < v_event.opens_at then
    raise exception 'Os palpites deste evento ainda não abriram';
  end if;
  if now() >= v_event.closes_at then
    raise exception 'Os palpites deste evento já foram encerrados';
  end if;
  if v_option.status <> 'active' then
    raise exception 'Esta opção não está disponível';
  end if;

  if v_event.match_id is not null then
    select * into v_match from public.matches where id = v_event.match_id;
    if v_match.status <> 'scheduled'
       or (v_match.scheduled_at is not null and now() >= v_match.scheduled_at) then
      raise exception 'A partida já começou: palpites encerrados';
    end if;
  end if;

  -- 4. valor
  select * into v_settings from public.app_settings where id = 1;
  if p_stake is null or p_stake < v_settings.min_stake or p_stake > v_settings.max_stake then
    raise exception 'O valor do palpite precisa estar entre % e % ON Coins',
      v_settings.min_stake, v_settings.max_stake;
  end if;
  if v_wallet.balance < p_stake then
    raise exception 'Saldo insuficiente: você tem % ON Coins', v_wallet.balance;
  end if;

  -- 5. grava tudo
  insert into public.predictions (user_id, event_id, option_id, stake, odds_snapshot, idempotency_key)
  values (v_uid, v_event.id, v_option.id, p_stake, v_option.odds, p_idempotency_key)
  returning * into v_pred;

  update public.wallets set balance = balance - p_stake where id = v_wallet.id;

  insert into public.transactions (wallet_id, type, kind, amount, balance_after, description, reference_id)
  values (
    v_wallet.id, 'debit', 'stake', p_stake, v_wallet.balance - p_stake,
    left('Palpite: ' || v_event.title || ' (' || v_option.name || ' @ ' || v_option.odds || ')', 300),
    v_pred.id
  );

  return v_pred;
end;
$$;

revoke execute on function public.place_prediction(uuid, bigint, uuid) from public, anon;
grant execute on function public.place_prediction(uuid, bigint, uuid) to authenticated;
