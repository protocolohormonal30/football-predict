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

/**
 * Dado um par de gols esperados (casa/fora), calcula a distribuição
 * completa via Poisson: probabilidades 1X2, over 2.5 e o placar mais
 * provável. Usada tanto pelo modelo estatístico quanto pela calibração de
 * mercado, garantindo que os dois caminhos produzam resultados consistentes
 * entre "gols esperados", "placar mais provável" e as probabilidades.
 */
function analyzeScoreDistribution(lambdaHome, lambdaAway, maxGoals = MAX_GOALS) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let bestScore = { home: 0, away: 0, prob: 0 };

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonProbability(h, lambdaHome) * poissonProbability(a, lambdaAway);

      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      if (h + a > 2.5) over25 += p;
      if (p > bestScore.prob) bestScore = { home: h, away: a, prob: p };
    }
  }

  return { homeWin, draw, awayWin, over25, bestScore };
}

function smoothedRate(goalsTotal, played, leagueAvg) {
  if (!leagueAvg) return played ? goalsTotal / played : 0;
  return (goalsTotal + SMOOTHING_GAMES * leagueAvg) / (played + SMOOTHING_GAMES);
}

function computeExpectedGoalsFromStats(league, home, away) {
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
 * Busca, por varredura numérica, o par de gols esperados (casa/fora) cuja
 * distribuição de Poisson reproduz mais de perto as probabilidades 1X2
 * observadas no mercado de apostas. Isso garante que "gols esperados" e
 * "placar mais provável" fiquem SEMPRE consistentes com as probabilidades
 * mostradas — evita o tipo de contradição "time desfavorecido tem mais
 * gols esperados e vence no placar mais provável".
 */
function calibrateExpectedGoalsToMarket(targetHomeWin, targetDraw, maxGoals = MAX_GOALS) {
  let best = { lambdaHome: 1.3, lambdaAway: 1.1, error: Infinity };

  // Varredura grosseira em todo o intervalo plausível de gols esperados
  for (let lh = 0.1; lh <= 5; lh += 0.1) {
    for (let la = 0.1; la <= 5; la += 0.1) {
      const { homeWin, draw } = analyzeScoreDistribution(lh, la, maxGoals);
      const error = (homeWin - targetHomeWin) ** 2 + (draw - targetDraw) ** 2;
      if (error < best.error) best = { lambdaHome: lh, lambdaAway: la, error };
    }
  }

  // Refinamento fino ao redor do melhor ponto encontrado
  const baseLh = best.lambdaHome;
  const baseLa = best.lambdaAway;
  for (let lh = Math.max(0.05, baseLh - 0.1); lh <= baseLh + 0.1; lh += 0.01) {
    for (let la = Math.max(0.05, baseLa - 0.1); la <= baseLa + 0.1; la += 0.01) {
      const { homeWin, draw } = analyzeScoreDistribution(lh, la, maxGoals);
      const error = (homeWin - targetHomeWin) ** 2 + (draw - targetDraw) ** 2;
      if (error < best.error) best = { lambdaHome: lh, lambdaAway: la, error };
    }
  }

  return { expectedHomeGoals: best.lambdaHome, expectedAwayGoals: best.lambdaAway };
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

  const { expectedHomeGoals, expectedAwayGoals } = computeExpectedGoalsFromStats(league, home, away);

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
 * (The Odds API), TUDO na resposta — probabilidades 1X2, over/under, gols
 * esperados e placar mais provável — é derivado/calibrado a partir dessas
 * odds, pra garantir consistência interna. O modelo estatístico baseado
 * apenas nos jogos desta Copa (football-data.org) só é usado quando não há
 * odds de mercado disponíveis pra esse confronto específico (ex: fases
 * futuras do mata-mata ainda sem odds publicadas).
 */
async function predictMatch(sportKey, homeTeam, awayTeam) {
  const market = await marketOdds.getMarketProbabilities(sportKey, homeTeam, awayTeam).catch(() => null);

  let stats = null;
  try {
    stats = await expectedGoals(sportKey, homeTeam, awayTeam);
  } catch (err) {
    if (!market) throw err; // sem mercado e sem modelo estatístico: não há o que responder
  }

  if (market) {
    const { expectedHomeGoals, expectedAwayGoals } = calibrateExpectedGoalsToMarket(market.homeWin, market.draw);
    const { over25, bestScore } = analyzeScoreDistribution(expectedHomeGoals, expectedAwayGoals);

    return {
      sportKey,
      homeTeam,
      awayTeam,
      source: stats
        ? `odds de mercado (The Odds API, ${market.numBookmakers} casa(s)) + ${stats.source}`
        : `odds de mercado (The Odds API, ${market.numBookmakers} casa(s))`,
      expectedGoals: {
        home: round(expectedHomeGoals),
        away: round(expectedAwayGoals),
      },
      probabilities: {
        homeWin: round(market.homeWin),
        draw: round(market.draw),
        awayWin: round(market.awayWin),
        over25Goals: market.over25Goals != null ? round(market.over25Goals) : round(over25),
        under25Goals: market.under25Goals != null ? round(market.under25Goals) : round(1 - over25),
      },
      mostLikelyScore: `${bestScore.home}-${bestScore.away}`,
      confidence: 'alta (baseado em odds reais de mercado)',
      basedOn: {
        ...(stats
          ? {
              homeMatchesPlayed: stats.homeStats.played,
              awayMatchesPlayed: stats.awayStats.played,
              leagueMatchesSampled: stats.league.sampleSize,
            }
          : {}),
        numBookmakers: market.numBookmakers,
      },
    };
  }

  // Sem odds de mercado disponíveis: usa só o modelo estatístico.
  const { expectedHomeGoals, expectedAwayGoals, league, homeStats, awayStats, source } = stats;
  const { homeWin, draw, awayWin, over25, bestScore } = analyzeScoreDistribution(expectedHomeGoals, expectedAwayGoals);

  let confidence = 'baixa (poucos dados históricos)';
  const minTeamGames = Math.min(homeStats.played, awayStats.played);
  if (league.sampleSize >= 30 && minTeamGames >= 3) confidence = 'alta';
  else if (league.sampleSize >= 10 && minTeamGames >= 2) confidence = 'média';

  return {
    sportKey,
    homeTeam,
    awayTeam,
    source,
    expectedGoals: {
      home: round(expectedHomeGoals),
      away: round(expectedAwayGoals),
    },
    probabilities: {
      homeWin: round(homeWin),
      draw: round(draw),
      awayWin: round(awayWin),
      over25Goals: round(over25),
      under25Goals: round(1 - over25),
    },
    mostLikelyScore: `${bestScore.home}-${bestScore.away}`,
    confidence,
    basedOn: {
      homeMatchesPlayed: homeStats.played,
      awayMatchesPlayed: awayStats.played,
      leagueMatchesSampled: league.sampleSize,
    },
  };
}

module.exports = { predictMatch, expectedGoals };
