-- =====================================================================
-- ON BETS — Disputa de pênaltis
-- ---------------------------------------------------------------------
-- Qualquer partida finalizada pode ter disputa de pênaltis, mesmo sem
-- empate no placar do jogo (ex.: jogo de volta que empata no agregado
-- de ida e volta). Regras garantidas pelo banco:
--   - pênaltis só existem em partida finalizada;
--   - os dois lados são preenchidos juntos (ou nenhum);
--   - pênaltis não terminam empatados.
-- O placar do jogo continua em home_score/away_score.
-- =====================================================================

alter table public.matches
  add column home_penalties smallint check (home_penalties >= 0),
  add column away_penalties smallint check (away_penalties >= 0),
  add constraint matches_penalties_both check ((home_penalties is null) = (away_penalties is null)),
  add constraint matches_penalties_finished check (
    home_penalties is null
    or (status = 'finished' and home_penalties <> away_penalties)
  );

-- auditoria passa a registrar também os pênaltis
create or replace function public.audit_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.home_score is distinct from old.home_score
     or new.away_score is distinct from old.away_score or new.scheduled_at is distinct from old.scheduled_at
     or new.home_penalties is distinct from old.home_penalties or new.away_penalties is distinct from old.away_penalties then
    perform public._audit('match.update', 'matches', new.id,
      jsonb_build_object(
        'status', jsonb_build_object('before', old.status, 'after', new.status),
        'score', jsonb_build_object('before', concat(old.home_score, 'x', old.away_score),
                                    'after', concat(new.home_score, 'x', new.away_score)),
        'penalties', jsonb_build_object('before', concat(old.home_penalties, 'x', old.away_penalties),
                                        'after', concat(new.home_penalties, 'x', new.away_penalties)),
        'scheduled_at', jsonb_build_object('before', old.scheduled_at, 'after', new.scheduled_at)));
  end if;
  return new;
end;
$$;
