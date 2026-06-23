const { poissonProbability } = require('../utils/poisson');
const config = require('../config');
const footballDataStats = require('./footballDataStatsService');
const marketOdds = require('./marketOddsService');

const MAX_GOALS = 8; // gols por time considerados na matriz de probabilidade

// Nº de "jogos fantasmas" usados para suavizar amostras pequenas (ex: início
// de Copa do Mundo, time com 1-2 jogos). Sem isso, um time com 0 gols
// sofridos em 1 jogo apareceria como "impossível sofrer gol" — um exagero
// estatístico. Conforme o time disputa mais jogos reais, esse efeito de
// suavização perde peso naturalmente.
const SMOOTHING_GAMES = 4;

function round(n) {
  return n == null ? null : Math.round(n * 1000) / 1000;
}

function smoothedRate(goalsTotal, played, leagueAvg) {
  if (!leagueAvg) return played ? goalsTotal / played : 0;
  return (goalsTotal + SMOOTHING_GAMES * leagueAvg) / (played + SMOOTHING_GAMES);
}

function computeExpectedGoals(league, home, away) {
  const combinedLeagueAvg = ((league.avgHomeGoals || 0) + (league.avgAwayGoals || 0)) / 2 || 1.25;

  const homeForRate = smoothedRate(home.goalsFor, home.played, combinedLeagueAvg);
  const homeAgainstRate = smoothedRate(home.goalsAgainst, home.played, combinedLeagueAvg);
  const awayForRate = smoothedRate(away.goalsFor, away.played, combinedLeagueAvg);
  const awayAgainstRate = smoothedRate(away.goalsAgainst, away.played, combinedLeagueAvg);

  const homeAttack = homeForRate / combinedLeagueAvg;
  const homeDefense = homeAgainstRate / combinedLeagueAvg;
  const awayAttack = awayForRate / combinedLeagueAvg;
  const awayDefense = awayAgainstRate / combinedLeagueAvg;

  return {
    expectedHomeGoals: (league.avgHomeGoals || combinedLeagueAvg) * homeAttack * awayDefense,
    expectedAwayGoals: (league.avgAwayGoals || combinedLeagueAvg) * awayAttack * homeDefense,
  };
}

/**
 * Busca os dados (ao vivo, com cache em memória) e calcula os gols
 * esperados de cada time num confronto, via football-data.org.
 */
async function expectedGoals(sportKey, homeTeam, awayTeam) {
  const competitionCode = config.competitionMap[sportKey];
  if (!competitionCode) {
    throw new Error(`Competição "${sportKey}" não está mapeada para a football-data.org.`);
  }

  const league = await footballDataStats.getLeagueAverages(competitionCode);
  if (!league.sampleSize) {
    throw new Error('Ainda não há partidas finalizadas suficientes nesta competição para calcular uma previsão.');
  }

  const home = await footballDataStats.getTeamStatsFromStandings(competitionCode, homeTeam);
  const away = await footballDataStats.getTeamStatsFromStandings(competitionCode, awayTeam);

  if (!home || !away) {
    throw new Error(
      'Não encontrei um ou os dois times na classificação dessa competição. Confira o nome exato (ex: "Brazil", "Argentina") em GET /api/standings/:competitionCode.'
    );
  }

  const { expectedHomeGoals, expectedAwayGoals } = computeExpectedGoals(league, home, away);

  return {
    expectedHomeGoals,
    expectedAwayGoals,
    league,
    homeStats: home,
    awayStats: away,
    source: 'football-data.org (modelo estatístico)',
  };
}

/**
 * Gera a previsão completa de uma partida.
 *
 * Prioridade: se houver odds reais de mercado disponíveis pra esse confronto
 * (The Odds API), usa a probabilidade implícita do mercado pra 1X2 e
 * over/under — é a informação mais confiável que existe, porque já
 * incorpora tudo que o mercado sabe sobre os times (não só os resultados
 * desta Copa). O modelo estatístico (football-data.org) continua sendo
 * usado pra estimar os gols esperados e o placar mais provável, e funciona
 * como única fonte quando o confronto ainda não tem odds publicadas.
 */
async function predictMatch(sportKey, homeTeam, awayTeam) {
  const market = await marketOdds.getMarketProbabilities(sportKey, homeTeam, awayTeam).catch(() => null);

  let stats = null;
  try {
    stats = await expectedGoals(sportKey, homeTeam, awayTeam);
  } catch (err) {
    if (!market) throw err; // sem mercado e sem modelo estatístico: não há o que responder
  }

  // Caso raro: tem odds de mercado, mas o time não foi encontrado na
  // football-data.org (não dá pra calcular gols esperados/placar).
  if (!stats) {
    return {
      sportKey,
      homeTeam,
      awayTeam,
      source: 'odds de mercado (The Odds API)',
      expectedGoals: null,
      probabilities: {
        homeWin: round(market.homeWin),
        draw: round(market.draw),
        awayWin: round(market.awayWin),
        over25Goals: round(market.over25Goals),
        under25Goals: round(market.under25Goals),
      },
      mostLikelyScore: null,
      confidence: `alta (baseado em odds reais de ${market.numBookmakers} casa(s) de apostas)`,
      basedOn: { numBookmakers: market.numBookmakers },
    };
  }

  const { expectedHomeGoals, expectedAwayGoals, league, homeStats, awayStats, source } = stats;

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  const scoreMatrix = [];

  for (let h = 0; h <= MAX_GOALS; h++) {
    const row = [];
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poissonProbability(h, expectedHomeGoals) * poissonProbability(a, expectedAwayGoals);
      row.push(p);

      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      if (h + a > 2.5) over25 += p;
    }
    scoreMatrix.push(row);
  }

  let bestScore = { home: 0, away: 0, prob: 0 };
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      if (scoreMatrix[h][a] > bestScore.prob) {
        bestScore = { home: h, away: a, prob: scoreMatrix[h][a] };
      }
    }
  }

  // Se há odds de mercado, elas substituem as probabilidades 1X2 e
  // over/under calculadas pelo modelo estatístico (mais confiáveis).
  // O placar mais provável e os gols esperados continuam vindo do modelo
  // estatístico, já que odds de 1X2 não informam isso diretamente.
  const probabilities = market
    ? {
        homeWin: round(market.homeWin),
        draw: round(market.draw),
        awayWin: round(market.awayWin),
        over25Goals: market.over25Goals != null ? round(market.over25Goals) : round(over25),
        under25Goals: market.under25Goals != null ? round(market.under25Goals) : round(1 - over25),
      }
    : {
        homeWin: round(homeWin),
        draw: round(draw),
        awayWin: round(awayWin),
        over25Goals: round(over25),
        under25Goals: round(1 - over25),
      };

  const finalSource = market
    ? `odds de mercado (The Odds API, ${market.numBookmakers} casa(s)) + ${source}`
    : source;

  let confidence;
  if (market) {
    confidence = 'alta (baseado em odds reais de mercado)';
  } else {
    confidence = 'baixa (poucos dados históricos)';
    const minTeamGames = Math.min(homeStats.played, awayStats.played);
    if (league.sampleSize >= 30 && minTeamGames >= 3) confidence = 'alta';
    else if (league.sampleSize >= 10 && minTeamGames >= 2) confidence = 'média';
  }

  return {
    sportKey,
    homeTeam,
    awayTeam,
    source: finalSource,
    expectedGoals: {
      home: round(expectedHomeGoals),
      away: round(expectedAwayGoals),
    },
    probabilities,
    mostLikelyScore: `${bestScore.home}-${bestScore.away}`,
    confidence,
    basedOn: {
      homeMatchesPlayed: homeStats.played,
      awayMatchesPlayed: awayStats.played,
      leagueMatchesSampled: league.sampleSize,
      ...(market ? { numBookmakers: market.numBookmakers } : {}),
    },
  };
}

module.exports = { predictMatch, expectedGoals };
