-- =====================================================================
-- ON BETS — Pênaltis em qualquer partida finalizada
-- ---------------------------------------------------------------------
-- Antes, pênaltis só eram aceitos quando o placar do jogo empatava.
-- No camp há jogos de ida e volta: o jogo de volta pode terminar 2 x 1
-- e mesmo assim ir para os pênaltis por empate no agregado.
-- Continua valendo:
--   - pênaltis só existem em partida finalizada;
--   - os dois lados são preenchidos juntos (ou nenhum);
--   - pênaltis não terminam empatados.
-- =====================================================================

alter table public.matches
  drop constraint matches_penalties_only_on_draw,
  add constraint matches_penalties_finished check (
    home_penalties is null
    or (status = 'finished' and home_penalties <> away_penalties)
  );
