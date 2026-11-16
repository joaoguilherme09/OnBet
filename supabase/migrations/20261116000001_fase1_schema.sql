-- =====================================================================
-- ON BETS — Fase 1: esquema do banco de dados
-- ---------------------------------------------------------------------
-- Rode este arquivo inteiro no SQL Editor do Supabase (ou via CLI:
-- `supabase db push`). Ele é idempotente apenas em parte: rode UMA vez
-- num projeto novo.
--
-- Princípios:
--   * ON Coins são inteiros (bigint). Odds são numeric(6,2).
--   * Tabelas "de dinheiro" (wallets, transactions, predictions,
--     admin_audit_log, app_settings) NÃO têm policies de escrita:
--     só funções SECURITY DEFINER (fases 2–5) podem alterá-las.
--   * Catálogo (times, campeonatos, partidas, eventos, opções) é
--     escrito pelo admin diretamente, protegido por RLS + triggers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.user_role          as enum ('participant', 'admin');
create type public.competition_status as enum ('planned', 'ongoing', 'finished');
create type public.match_status       as enum ('scheduled', 'live', 'finished', 'cancelled');
create type public.event_category     as enum ('match', 'competition', 'milestone');
create type public.event_status       as enum ('draft', 'open', 'closed', 'settled', 'void');
create type public.option_status      as enum ('active', 'inactive');
create type public.prediction_status  as enum ('pending', 'won', 'lost', 'void');
create type public.transaction_type   as enum ('credit', 'debit');
create type public.transaction_kind   as enum ('initial_credit', 'stake', 'payout', 'refund', 'admin_adjustment');

-- ---------------------------------------------------------------------
-- Utilitário: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles — 1:1 com auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null
              check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  full_name   text check (char_length(full_name) <= 80),
  avatar_url  text check (char_length(avatar_url) <= 500),
  role        public.user_role not null default 'participant',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_username_lower_key on public.profiles (lower(username));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Helper de permissão usado nas policies. SECURITY DEFINER para não
-- entrar em recursão com a RLS da própria tabela profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- app_settings — linha única com parâmetros configuráveis
-- ---------------------------------------------------------------------
create table public.app_settings (
  id               smallint primary key default 1 check (id = 1),
  initial_balance  bigint not null default 1000 check (initial_balance >= 0),
  min_stake        bigint not null default 10   check (min_stake > 0),
  max_stake        bigint not null default 5000,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null,
  constraint app_settings_stake_range check (max_stake >= min_stake)
);
insert into public.app_settings (id) values (1);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- wallets — uma por usuário; saldo nunca negativo
-- ---------------------------------------------------------------------
create table public.wallets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles (id) on delete cascade,
  balance     bigint not null default 0 check (balance >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger wallets_updated_at before update on public.wallets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- transactions — livro-razão imutável
-- ---------------------------------------------------------------------
create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null references public.wallets (id) on delete cascade,
  type           public.transaction_type not null,
  kind           public.transaction_kind not null,
  amount         bigint not null check (amount > 0),
  balance_after  bigint not null check (balance_after >= 0),
  description    text not null check (char_length(description) between 1 and 300),
  reference_id   uuid,          -- palpite, evento ou ajuste relacionado
  created_by     uuid references public.profiles (id) on delete set null, -- admin, em ajustes
  created_at     timestamptz not null default now(),
  constraint transactions_type_matches_kind check (
    (kind in ('initial_credit', 'payout', 'refund') and type = 'credit')
    or (kind = 'stake' and type = 'debit')
    or (kind = 'admin_adjustment')
  ),
  constraint transactions_reference_required check (
    kind in ('initial_credit', 'admin_adjustment') or reference_id is not null
  )
);
create index transactions_wallet_created_idx on public.transactions (wallet_id, created_at desc);
-- Um único crédito inicial por carteira.
create unique index transactions_one_initial_credit
  on public.transactions (wallet_id) where kind = 'initial_credit';
-- Um palpite só pode ser debitado / pago / reembolsado uma vez.
create unique index transactions_once_per_reference
  on public.transactions (kind, reference_id) where kind in ('stake', 'payout', 'refund');

-- ---------------------------------------------------------------------
-- teams — times reutilizáveis entre campeonatos (escudo)
-- ---------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 60),
  short_name  text check (char_length(short_name) between 2 and 5),
  logo_url    text check (char_length(logo_url) <= 500),
  created_at  timestamptz not null default now()
);
create unique index teams_name_lower_key on public.teams (lower(name));

-- ---------------------------------------------------------------------
-- competitions + equipes participantes
-- ---------------------------------------------------------------------
create table public.competitions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 80),
  description  text check (char_length(description) <= 2000),
  logo_url     text check (char_length(logo_url) <= 500),
  status       public.competition_status not null default 'planned',
  starts_on    date,
  ends_on      date,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint competitions_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create trigger competitions_updated_at before update on public.competitions
  for each row execute function public.set_updated_at();

create table public.competition_teams (
  competition_id  uuid not null references public.competitions (id) on delete cascade,
  team_id         uuid not null references public.teams (id) on delete restrict,
  primary key (competition_id, team_id)
);
create index competition_teams_team_idx on public.competition_teams (team_id);

-- ---------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------
create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions (id) on delete restrict,
  home_team_id    uuid not null references public.teams (id) on delete restrict,
  away_team_id    uuid not null references public.teams (id) on delete restrict,
  stage           text check (char_length(stage) <= 60),   -- ex.: "Quartas de final"
  scheduled_at    timestamptz not null,
  home_score      smallint check (home_score >= 0),
  away_score      smallint check (away_score >= 0),
  status          public.match_status not null default 'scheduled',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_score_when_finished check (
    status <> 'finished' or (home_score is not null and away_score is not null)
  )
);
create index matches_competition_idx on public.matches (competition_id);
create index matches_scheduled_idx   on public.matches (scheduled_at);
create trigger matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- prediction_events — sistema central para as 3 categorias
-- ---------------------------------------------------------------------
create table public.prediction_events (
  id                 uuid primary key default gen_random_uuid(),
  category           public.event_category not null,
  competition_id     uuid references public.competitions (id) on delete restrict,
  match_id           uuid references public.matches (id) on delete restrict,
  title              text not null check (char_length(title) between 3 and 120),
  description        text check (char_length(description) <= 2000),
  rules              text check (char_length(rules) <= 2000), -- empate, desistência, anulação
  status             public.event_status not null default 'draft',
  opens_at           timestamptz not null default now(),
  closes_at          timestamptz not null,
  winning_option_id  uuid,
  settled_at         timestamptz,
  settled_by         uuid references public.profiles (id) on delete set null,
  void_reason        text check (char_length(void_reason) <= 300),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint events_window check (closes_at > opens_at),
  constraint events_match_link check (category <> 'match' or match_id is not null),
  constraint events_competition_link check (category <> 'competition' or competition_id is not null),
  constraint events_milestone_rules check (category <> 'milestone' or rules is not null),
  constraint events_settled_state check (
    status <> 'settled' or (winning_option_id is not null and settled_at is not null)
  ),
  constraint events_void_state check (
    status <> 'void' or (winning_option_id is null and settled_at is not null)
  ),
  constraint events_winner_only_when_settled check (
    winning_option_id is null or status = 'settled'
  )
);
create index prediction_events_status_closes_idx on public.prediction_events (status, closes_at);
create index prediction_events_match_idx         on public.prediction_events (match_id);
create index prediction_events_competition_idx   on public.prediction_events (competition_id);
create trigger prediction_events_updated_at before update on public.prediction_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- prediction_options
-- ---------------------------------------------------------------------
create table public.prediction_options (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.prediction_events (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text check (char_length(description) <= 300),
  team_id      uuid references public.teams (id) on delete set null,
  odds         numeric(6,2) not null check (odds >= 1.01 and odds <= 1000),
  status       public.option_status not null default 'active',
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint prediction_options_event_id_key unique (event_id, id)
);
create unique index prediction_options_name_per_event on public.prediction_options (event_id, lower(name));
create trigger prediction_options_updated_at before update on public.prediction_options
  for each row execute function public.set_updated_at();

-- A opção vencedora precisa pertencer ao próprio evento.
alter table public.prediction_events
  add constraint prediction_events_winning_option_fk
  foreign key (id, winning_option_id)
  references public.prediction_options (event_id, id);

-- ---------------------------------------------------------------------
-- predictions — palpites (odd congelada em odds_snapshot)
-- ---------------------------------------------------------------------
create table public.predictions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  event_id          uuid not null references public.prediction_events (id) on delete restrict,
  option_id         uuid not null,
  stake             bigint not null check (stake > 0),
  odds_snapshot     numeric(6,2) not null check (odds_snapshot >= 1.01),
  potential_payout  bigint generated always as (floor(stake * odds_snapshot)::bigint) stored,
  status            public.prediction_status not null default 'pending',
  payout            bigint not null default 0 check (payout >= 0),
  idempotency_key   uuid not null,
  created_at        timestamptz not null default now(),
  settled_at        timestamptz,
  -- a opção precisa ser do mesmo evento
  constraint predictions_option_fk foreign key (event_id, option_id)
    references public.prediction_options (event_id, id) on delete restrict,
  -- mesmo clique enviado 2x = mesmo palpite
  constraint predictions_idempotency_key unique (user_id, idempotency_key),
  constraint predictions_payout_state check (
    (status = 'pending' and payout = 0 and settled_at is null)
    or (status = 'lost'  and payout = 0 and settled_at is not null)
    or (status = 'won'   and payout = potential_payout and settled_at is not null)
    or (status = 'void'  and payout = stake and settled_at is not null)
  )
);
create index predictions_user_created_idx on public.predictions (user_id, created_at desc);
create index predictions_event_idx        on public.predictions (event_id);
create index predictions_option_idx       on public.predictions (event_id, option_id);

-- ---------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------
create table public.admin_audit_log (
  id           bigint generated always as identity primary key,
  admin_id     uuid references public.profiles (id) on delete set null,
  action       text not null,      -- ex.: 'wallet.adjust', 'event.settle'
  target_table text not null,
  target_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx  on public.admin_audit_log (target_table, target_id);

-- =====================================================================
-- Triggers de integridade
-- =====================================================================

-- Livro-razão e auditoria não podem ser editados.
create or replace function public.forbid_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registros de % são imutáveis', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger transactions_immutable before update on public.transactions
  for each row execute function public.forbid_update();
create trigger admin_audit_log_immutable before update on public.admin_audit_log
  for each row execute function public.forbid_update();

-- Palpite: só status/payout/settled_at mudam, e só a partir de 'pending'
-- (a apuração é feita uma única vez).
create or replace function public.guard_prediction_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id       is distinct from old.user_id
  or new.event_id      is distinct from old.event_id
  or new.option_id     is distinct from old.option_id
  or new.stake         is distinct from old.stake
  or new.odds_snapshot is distinct from old.odds_snapshot
  or new.idempotency_key is distinct from old.idempotency_key
  or new.created_at    is distinct from old.created_at then
    raise exception 'Dados do palpite não podem ser alterados' using errcode = 'P0001';
  end if;

  if old.status <> 'pending' then
    raise exception 'Palpite já apurado' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger predictions_guard before update on public.predictions
  for each row execute function public.guard_prediction_update();

-- Evento: apuração/anulação só pelas funções oficiais (que ligam a flag
-- 'onbets.settling' na transação). Eventos apurados/anulados congelam.
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
  or new.winning_option_id is distinct from old.winning_option_id
  or new.settled_at        is distinct from old.settled_at
  or new.settled_by        is distinct from old.settled_by then
    raise exception 'Use a função de apuração para encerrar o evento' using errcode = 'P0001';
  end if;

  if new.category is distinct from old.category
  and exists (select 1 from public.predictions p where p.event_id = old.id) then
    raise exception 'Categoria não pode mudar depois de receber palpites' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger prediction_events_guard before update on public.prediction_events
  for each row execute function public.guard_event_update();

create or replace function public.guard_event_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('settled', 'void') or new.winning_option_id is not null then
    raise exception 'Evento não pode nascer apurado' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger prediction_events_guard_insert before insert on public.prediction_events
  for each row execute function public.guard_event_insert();

-- Opções de eventos encerrados de vez não mudam (odds antigas ficam
-- preservadas de qualquer forma em predictions.odds_snapshot).
create or replace function public.guard_option_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid := coalesce(new.event_id, old.event_id);
  v_status public.event_status;
begin
  if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id then
    raise exception 'Opção não pode trocar de evento' using errcode = 'P0001';
  end if;

  select status into v_status from public.prediction_events where id = v_event_id;
  if v_status in ('settled', 'void') then
    raise exception 'Evento já apurado ou anulado: opções congeladas' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger prediction_options_guard before insert or update or delete on public.prediction_options
  for each row execute function public.guard_option_change();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.app_settings       enable row level security;
alter table public.wallets            enable row level security;
alter table public.transactions       enable row level security;
alter table public.teams              enable row level security;
alter table public.competitions       enable row level security;
alter table public.competition_teams  enable row level security;
alter table public.matches            enable row level security;
alter table public.prediction_events  enable row level security;
alter table public.prediction_options enable row level security;
alter table public.predictions        enable row level security;
alter table public.admin_audit_log    enable row level security;

-- ---- profiles -------------------------------------------------------
create policy "profiles: ler o próprio ou admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: editar o próprio"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---- app_settings (leitura pública; escrita via função) -------------
create policy "app_settings: leitura"
  on public.app_settings for select to anon, authenticated
  using (true);

-- ---- wallets / transactions / predictions (somente leitura) ---------
create policy "wallets: ler a própria ou admin"
  on public.wallets for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "transactions: ler as próprias ou admin"
  on public.transactions for select to authenticated
  using (
    (select public.is_admin())
    or wallet_id in (select w.id from public.wallets w where w.user_id = (select auth.uid()))
  );

create policy "predictions: ler os próprios ou admin"
  on public.predictions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---- auditoria ------------------------------------------------------
create policy "audit: leitura admin"
  on public.admin_audit_log for select to authenticated
  using ((select public.is_admin()));

-- ---- catálogo: leitura pública, escrita admin -----------------------
create policy "teams: leitura"        on public.teams        for select to anon, authenticated using (true);
create policy "teams: admin insere"   on public.teams        for insert to authenticated with check ((select public.is_admin()));
create policy "teams: admin edita"    on public.teams        for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "teams: admin remove"   on public.teams        for delete to authenticated using ((select public.is_admin()));

create policy "competitions: leitura"      on public.competitions for select to anon, authenticated using (true);
create policy "competitions: admin insere" on public.competitions for insert to authenticated with check ((select public.is_admin()));
create policy "competitions: admin edita"  on public.competitions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "competitions: admin remove" on public.competitions for delete to authenticated using ((select public.is_admin()));

create policy "competition_teams: leitura"      on public.competition_teams for select to anon, authenticated using (true);
create policy "competition_teams: admin insere" on public.competition_teams for insert to authenticated with check ((select public.is_admin()));
create policy "competition_teams: admin remove" on public.competition_teams for delete to authenticated using ((select public.is_admin()));

create policy "matches: leitura"      on public.matches for select to anon, authenticated using (true);
create policy "matches: admin insere" on public.matches for insert to authenticated with check ((select public.is_admin()));
create policy "matches: admin edita"  on public.matches for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "matches: admin remove" on public.matches for delete to authenticated using ((select public.is_admin()));

-- Rascunhos só aparecem para admin.
create policy "events: leitura"
  on public.prediction_events for select to anon, authenticated
  using (status <> 'draft' or (select public.is_admin()));
create policy "events: admin insere" on public.prediction_events for insert to authenticated with check ((select public.is_admin()));
create policy "events: admin edita"  on public.prediction_events for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "events: admin remove"
  on public.prediction_events for delete to authenticated
  using ((select public.is_admin()) and status = 'draft');

create policy "options: leitura"
  on public.prediction_options for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.prediction_events e
      where e.id = event_id and e.status <> 'draft'
    )
  );
create policy "options: admin insere" on public.prediction_options for insert to authenticated with check ((select public.is_admin()));
create policy "options: admin edita"  on public.prediction_options for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "options: admin remove" on public.prediction_options for delete to authenticated using ((select public.is_admin()));

-- =====================================================================
-- Privilégios (defesa em profundidade, além da RLS)
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;

grant select on public.app_settings, public.teams, public.competitions,
                public.competition_teams, public.matches,
                public.prediction_events, public.prediction_options
  to anon, authenticated;

grant select on public.profiles, public.wallets, public.transactions,
                public.predictions, public.admin_audit_log
  to authenticated;

-- Usuário só edita estas colunas do próprio perfil — nunca 'role'.
grant update (username, full_name, avatar_url) on public.profiles to authenticated;

-- Catálogo: escrita liberada no nível de privilégio, filtrada pela RLS (admin).
grant insert, update, delete on public.teams, public.competitions, public.matches,
                                public.prediction_events, public.prediction_options
  to authenticated;
grant insert, delete on public.competition_teams to authenticated;

-- Funções internas não devem ser chamadas pela API.
revoke execute on function public.set_updated_at(), public.forbid_update(),
                           public.guard_prediction_update(), public.guard_event_update(),
                           public.guard_event_insert(), public.guard_option_change()
  from public, anon, authenticated;
-- is_admin() é usada nas policies, inclusive nas lidas por visitantes (anon).
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
