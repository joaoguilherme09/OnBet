-- =====================================================================
-- DADOS DE DEMONSTRAÇÃO — opcional, só para ver a home preenchida.
-- Tudo aqui fica marcado com "(demo)" no nome e pode ser apagado com
-- o bloco "LIMPAR DEMO" no fim do arquivo. Não use em produção.
-- =====================================================================

insert into public.teams (name, short_name) values
  ('Milan (demo)', 'MIL'), ('PSV (demo)', 'PSV'),
  ('Frankfurt (demo)', 'FRA'), ('Feyenoord (demo)', 'FEY');

insert into public.competitions (name, description, status, starts_on)
values ('ORG ON Champions (demo)', 'Campeonato de demonstração do ON BETS.', 'ongoing', current_date - 7);

insert into public.competition_teams (competition_id, team_id)
select c.id, t.id
from public.competitions c, public.teams t
where c.name = 'ORG ON Champions (demo)' and t.name like '%(demo)';

insert into public.matches (competition_id, home_team_id, away_team_id, stage, scheduled_at, status, home_score, away_score)
select c.id, h.id, a.id, x.stage, x.at, x.status::public.match_status, x.hs, x.aws
from public.competitions c
cross join (values
  ('MIL', 'PSV', 'Semifinal',      now() + interval '1 day',        'scheduled', null::smallint, null::smallint),
  ('FRA', 'FEY', 'Semifinal',      now() + interval '1 day 1 hour', 'scheduled', null, null),
  ('FEY', 'MIL', 'Fase de grupos', now() - interval '2 days',       'finished',  3, 1)
) as x(home, away, stage, at, status, hs, aws)
join public.teams h on h.short_name = x.home and h.name like '%(demo)'
join public.teams a on a.short_name = x.away and a.name like '%(demo)'
where c.name = 'ORG ON Champions (demo)';

-- Um evento de palpite por partida agendada, fechando no horário do jogo
insert into public.prediction_events (category, competition_id, match_id, title, status, closes_at)
select 'match', m.competition_id, m.id,
       replace(h.name, ' (demo)', '') || ' x ' || replace(a.name, ' (demo)', ''),
       'open', m.scheduled_at
from public.matches m
join public.teams h on h.id = m.home_team_id
join public.teams a on a.id = m.away_team_id
where m.status = 'scheduled' and h.name like '%(demo)';

-- Opções 1X2 dos eventos de partida (odds de exemplo)
insert into public.prediction_options (event_id, name, team_id, odds, sort_order)
select e.id, o.name, o.team_id, o.odds, o.sort_order
from public.prediction_events e
join public.matches m on m.id = e.match_id
join public.teams h on h.id = m.home_team_id
join public.teams a on a.id = m.away_team_id
cross join lateral (values
  (replace(h.name, ' (demo)', ''), h.id, 2.10::numeric, 1),
  ('Empate',                       null::uuid, 3.20, 2),
  (replace(a.name, ' (demo)', ''), a.id, 2.80, 3)
) as o(name, team_id, odds, sort_order)
where h.name like '%(demo)';

-- Evento de campeão
with c as (select id from public.competitions where name = 'ORG ON Champions (demo)'),
e as (
  insert into public.prediction_events (category, competition_id, title, rules, status, closes_at)
  select 'competition', c.id, 'Quem será o campeão da ORG ON Champions?',
         'Vale o campeão oficial anunciado pela ORG ON Camps. Se o campeonato for cancelado, o evento é anulado e os pontos devolvidos.',
         'open', now() + interval '5 days'
  from c returning id
)
insert into public.prediction_options (event_id, name, team_id, odds, sort_order)
select e.id, replace(t.name, ' (demo)', ''), t.id, x.odds, x.ord
from e
join (values ('MIL', 3.50, 1), ('PSV', 4.00, 2), ('FRA', 5.50, 3), ('FEY', 6.00, 4)) as x(short, odds, ord) on true
join public.teams t on t.short_name = x.short and t.name like '%(demo)';

-- Evento de marco histórico
insert into public.prediction_events (category, title, description, rules, status, closes_at)
values ('milestone', 'Quem será o primeiro jogador a conquistar 10 campeonatos? (demo)',
        'Previsão de longo prazo sobre os títulos da ORG ON Camps.',
        'Vale o primeiro a atingir 10 títulos oficiais validados pela administração. Se ninguém chegar até a data de encerramento, o evento é anulado e os pontos devolvidos.',
        'open', now() + interval '180 days');

insert into public.prediction_options (event_id, name, odds, sort_order)
select e.id, x.name, x.odds, x.ord
from public.prediction_events e,
     (values ('Kassio', 2.50, 1), ('Miguel', 3.00, 2), ('Vinicius', 3.50, 3), ('Outro participante', 4.00, 4)) as x(name, odds, ord)
where e.title like 'Quem será o primeiro jogador a conquistar 10 campeonatos? (demo)';

-- ---------------------------------------------------------------------
-- LIMPAR DEMO (rode só este bloco quando quiser remover os exemplos)
-- ---------------------------------------------------------------------
-- delete from public.prediction_events e
--   where e.title like '%(demo)'
--      or e.competition_id in (select id from public.competitions where name like '%(demo)');
-- delete from public.matches where competition_id in (select id from public.competitions where name like '%(demo)');
-- delete from public.competitions where name like '%(demo)';
-- delete from public.teams where name like '%(demo)';
