const config = require('../config');
const footballData = require('../apiClients/footballDataClient');
const { findBestMatch } = require('../utils/teamNameMatcher');

// Cache simples em memória (não depende de banco de dados — fica só na RAM
// do processo). Suficiente para o volume de uso deste serviço: evita repetir
// chamadas à football-data.org em consultas seguidas dentro de poucos minutos.
const cache = new Map();

async function getCached(key, fetcher) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < config.cacheTtlMs) {
    return cached.data;
  }
  const data = await fetcher();
  cache.set(key, { data, time: Date.now() });
  return data;
}

/**
 * Classificação completa de uma competição, juntando TODOS os grupos
 * (em competições com fase de grupos, como a Copa do Mundo, a football-data.org
 * retorna uma tabela "TOTAL" separada por grupo).
 */
async function getStandingsTable(competitionCode) {
  return getCached(`standings:${competitionCode}`, async () => {
    const data = await footballData.getStandings(competitionCode);
    const totalTables = (data.standings || []).filter((s) => s.type === 'TOTAL');
    return totalTables.flatMap((t) => t.table || []);
  });
}

/**
 * Partidas finalizadas de uma competição (usadas para calcular as médias
 * de gols da liga, base do modelo de previsão).
 */
async function getFinishedMatches(competitionCode) {
  return getCached(`matches:${competitionCode}`, async () => {
    const data = await footballData.getMatches(competitionCode, { status: 'FINISHED' });
    return data.matches || [];
  });
}

/**
 * Linha da tabela de classificação de um time específico, resolvendo
 * pequenas variações de nome entre fontes.
 */
async function getStanding(competitionCode, teamName) {
  const rows = await getStandingsTable(competitionCode);
  if (!rows.length) return null;

  const matchedName = findBestMatch(teamName, rows.map((r) => r.team.name));
  if (!matchedName) return null;

  return rows.find((r) => r.team.name === matchedName) || null;
}

/**
 * Médias de gols (casa/fora) da competição, calculadas a partir das partidas
 * finalizadas já disputadas.
 */
async function getLeagueAverages(competitionCode) {
  const matches = await getFinishedMatches(competitionCode);
  const withScore = matches.filter(
    (m) => m.score?.fullTime?.home != null && m.score?.fullTime?.away != null
  );

  if (!withScore.length) {
    return { avgHomeGoals: null, avgAwayGoals: null, sampleSize: 0 };
  }

  const totalHome = withScore.reduce((sum, m) => sum + m.score.fullTime.home, 0);
  const totalAway = withScore.reduce((sum, m) => sum + m.score.fullTime.away, 0);

  return {
    avgHomeGoals: totalHome / withScore.length,
    avgAwayGoals: totalAway / withScore.length,
    sampleSize: withScore.length,
  };
}

/**
 * Estatísticas de um time a partir da classificação oficial.
 */
async function getTeamStatsFromStandings(competitionCode, teamName) {
  const standing = await getStanding(competitionCode, teamName);
  if (!standing) return null;

  return {
    team: standing.team.name,
    competitionCode,
    position: standing.position,
    played: standing.playedGames,
    wins: standing.won,
    draws: standing.draw,
    losses: standing.lost,
    points: standing.points,
    goalsFor: standing.goalsFor,
    goalsAgainst: standing.goalsAgainst,
    avgGoalsFor: standing.playedGames ? standing.goalsFor / standing.playedGames : 0,
    avgGoalsAgainst: standing.playedGames ? standing.goalsAgainst / standing.playedGames : 0,
  };
}

module.exports = {
  getStandingsTable,
  getFinishedMatches,
  getStanding,
  getLeagueAverages,
  getTeamStatsFromStandings,
};
