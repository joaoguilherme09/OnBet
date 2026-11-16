-- =====================================================================
-- ON BETS — Fase 6: ranking, estatísticas e destaques
-- ---------------------------------------------------------------------
-- Funções de leitura que expõem só o necessário (username, saldo e
-- contagens), sem abrir as tabelas wallets/predictions para todos.
-- =====================================================================

create or replace function public.get_ranking(p_limit int default 100)
returns table (
  "position" bigint, user_id uuid, username text, balance bigint,
  predictions bigint, wins bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with stats as (
    select p.id, p.username, w.balance,
           count(x.id) as predictions,
           count(x.id) filter (where x.status = 'won') as wins
    from public.profiles p
    join public.wallets w on w.user_id = p.id
    left join public.predictions x on x.user_id = p.id
    group by p.id, p.username, w.balance
  )
  select rank() over (order by balance desc) as "position",
         id, username, balance, predictions, wins
  from stats
  order by balance desc, wins desc, lower(username)
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Posição do usuário logado (mesmo fora do limite do ranking)
create or replace function public.get_my_rank()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select w.user_id, rank() over (order by w.balance desc) as pos, count(*) over () as total
    from public.wallets w
  )
  select json_build_object('position', pos, 'total', total)
  from ranked where user_id = auth.uid();
$$;

create or replace function public.get_my_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
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
    'best_odds_won', max(odds_snapshot) filter (where status = 'won')
  )
  from public.predictions
  where user_id = auth.uid();
$$;

-- Destaques: maiores acertos recentes
create or replace function public.get_highlights(p_days int default 30, p_limit int default 5)
returns table (username text, event_title text, option_name text, odds numeric, stake bigint, payout bigint, settled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.username, e.title, o.name, p.odds_snapshot, p.stake, p.payout, p.settled_at
  from public.predictions p
  join public.profiles pr on pr.id = p.user_id
  join public.prediction_events e on e.id = p.event_id
  join public.prediction_options o on o.id = p.option_id
  where p.status = 'won' and p.settled_at > now() - make_interval(days => greatest(p_days, 1))
  order by p.payout - p.stake desc, p.settled_at desc
  limit least(greatest(p_limit, 1), 20);
$$;

revoke execute on function public.get_ranking(int), public.get_highlights(int, int) from public;
grant execute on function public.get_ranking(int), public.get_highlights(int, int) to anon, authenticated;

revoke execute on function public.get_my_rank(), public.get_my_stats() from public, anon;
grant execute on function public.get_my_rank(), public.get_my_stats() to authenticated;
