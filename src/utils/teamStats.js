/**
 * Estatísticas dos times a partir das partidas finalizadas.
 * Vitória/empate/derrota seguem o placar do jogo; a disputa de pênaltis
 * é contada à parte (um 1 x 1 decidido nos pênaltis é empate no placar).
 */

const emptyStats = (team) => ({
  team,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  cleanSheets: 0, // jogos sem sofrer gol
  failedToScore: 0, // jogos sem marcar
  penalties: { played: 0, won: 0, lost: 0 },
  biggestWin: null, // { opponent, gf, ga, date }
  biggestLoss: null,
  form: [], // 'W' | 'D' | 'L', do mais recente para o mais antigo
  opponents: new Map(), // id -> { team, played, wins, draws, losses, goalsFor, goalsAgainst }
})

const matchDate = (m) => m.scheduled_at ?? m.updated_at

/** @returns Map<teamId, stats> com todos os times (mesmo os sem jogos). */
export function computeTeamStats(teams, matches) {
  const byId = new Map(teams.map((t) => [t.id, emptyStats(t)]))
  const teamOf = (id) => byId.get(id)?.team ?? { id, name: '?' }

  // do mais recente para o mais antigo, para a sequência de forma
  const sorted = [...matches]
    .filter((m) => m.status === 'finished' && m.home_score != null && m.away_score != null)
    .sort((a, b) => (matchDate(a) < matchDate(b) ? 1 : -1))

  for (const m of sorted) {
    const sides = [
      [m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.home_penalties, m.away_penalties],
      [m.away_team_id, m.home_team_id, m.away_score, m.home_score, m.away_penalties, m.home_penalties],
    ]
    for (const [id, oppId, gf, ga, pf, pa] of sides) {
      if (!byId.has(id)) byId.set(id, emptyStats(teamOf(id)))
      const s = byId.get(id)
      const result = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
      s.played++
      s.goalsFor += gf
      s.goalsAgainst += ga
      if (ga === 0) s.cleanSheets++
      if (gf === 0) s.failedToScore++
      if (result === 'W') s.wins++
      else if (result === 'L') s.losses++
      else s.draws++
      s.form.push(result)

      if (pf != null && pa != null) {
        s.penalties.played++
        if (pf > pa) s.penalties.won++
        else s.penalties.lost++
      }

      const diff = gf - ga
      const entry = { opponent: teamOf(oppId), gf, ga, date: matchDate(m) }
      if (diff > 0 && (!s.biggestWin || diff > s.biggestWin.gf - s.biggestWin.ga)) s.biggestWin = entry
      if (diff < 0 && (!s.biggestLoss || diff < s.biggestLoss.gf - s.biggestLoss.ga)) s.biggestLoss = entry

      if (!s.opponents.has(oppId))
        s.opponents.set(oppId, { team: teamOf(oppId), played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 })
      const o = s.opponents.get(oppId)
      o.played++
      o.goalsFor += gf
      o.goalsAgainst += ga
      if (result === 'W') o.wins++
      else if (result === 'L') o.losses++
      else o.draws++
    }
  }

  for (const s of byId.values()) {
    const opps = [...s.opponents.values()]
    s.points = s.wins * 3 + s.draws
    s.efficiency = s.played ? Math.round((s.points / (s.played * 3)) * 100) : null // aproveitamento
    s.avgFor = s.played ? s.goalsFor / s.played : null
    s.avgAgainst = s.played ? s.goalsAgainst / s.played : null
    s.goalDiff = s.goalsFor - s.goalsAgainst
    // quem ele mais venceu / para quem mais perdeu (desempate: saldo de gols no confronto)
    s.mostBeaten = pickTop(opps.filter((o) => o.wins > 0), (o) => o.wins, (o) => o.goalsFor - o.goalsAgainst)
    s.mostLostTo = pickTop(opps.filter((o) => o.losses > 0), (o) => o.losses, (o) => o.goalsAgainst - o.goalsFor)
    s.headToHead = opps.sort((a, b) => b.played - a.played || a.team.name.localeCompare(b.team.name))
    s.streak = currentStreak(s.form)
    s.last5 = s.form.slice(0, 5)
  }
  return byId
}

function pickTop(list, main, tie) {
  return list.reduce((best, o) => (!best || main(o) > main(best) || (main(o) === main(best) && tie(o) > tie(best)) ? o : best), null)
}

/** Sequência atual: { type: 'W'|'D'|'L', count } */
function currentStreak(form) {
  if (!form.length) return null
  let count = 1
  while (count < form.length && form[count] === form[0]) count++
  return { type: form[0], count }
}
