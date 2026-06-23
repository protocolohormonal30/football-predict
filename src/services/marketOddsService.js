const config = require('../config');
const { getOdds } = require('../apiClients/oddsApiClient');
const { normalize, findBestMatch } = require('../utils/teamNameMatcher');

// Mesmo cache em memória usado para a football-data.org — evita gastar a
// cota da The Odds API em consultas repetidas dentro de poucos minutos.
const cache = new Map();

async function getCachedOdds(sportKey) {
  const cached = cache.get(sportKey);
  if (cached && Date.now() - cached.time < config.cacheTtlMs) {
    return cached.data;
  }
  const data = await getOdds(sportKey);
  cache.set(sportKey, { data, time: Date.now() });
  return data;
}

/**
 * Procura, entre os eventos com odds disponíveis, o que corresponde aos dois
 * times pedidos (em qualquer ordem, e tolerando nomes em português/erros de
 * digitação via teamNameMatcher). Retorna o evento e se a ordem pedida
 * (home/away) bate com a ordem do evento na Odds API.
 */
function findMatchingEvent(events, homeTeam, awayTeam) {
  for (const event of events) {
    const candidates = [event.home_team, event.away_team];
    const matchedHome = findBestMatch(homeTeam, candidates);
    const matchedAway = findBestMatch(awayTeam, candidates);
    if (matchedHome && matchedAway && matchedHome !== matchedAway) {
      return { event, sameOrder: matchedHome === event.home_team };
    }
  }
  return null;
}

/**
 * Calcula a probabilidade implícita do mercado 1X2 (casa/empate/fora),
 * removendo a margem da casa de apostas ("overround"), com a média entre
 * todas as casas de apostas disponíveis no evento.
 */
function devigH2H(event) {
  const results = [];

  for (const bookmaker of event.bookmakers || []) {
    const h2h = bookmaker.markets?.find((m) => m.key === 'h2h');
    if (!h2h) continue;

    let homePrice;
    let awayPrice;
    let drawPrice;

    for (const outcome of h2h.outcomes) {
      const n = normalize(outcome.name);
      if (n === 'draw') drawPrice = outcome.price;
      else if (n === normalize(event.home_team)) homePrice = outcome.price;
      else if (n === normalize(event.away_team)) awayPrice = outcome.price;
    }

    if (!homePrice || !awayPrice) continue;

    const invHome = 1 / homePrice;
    const invAway = 1 / awayPrice;
    const invDraw = drawPrice ? 1 / drawPrice : 0;
    const total = invHome + invAway + invDraw;

    results.push({
      homeWin: invHome / total,
      draw: invDraw / total,
      awayWin: invAway / total,
    });
  }

  if (!results.length) return null;

  const avg = (key) => results.reduce((sum, r) => sum + r[key], 0) / results.length;
  return {
    homeWin: avg('homeWin'),
    draw: avg('draw'),
    awayWin: avg('awayWin'),
    numBookmakers: results.length,
  };
}

/**
 * Calcula a probabilidade implícita do mercado over/under 2.5 gols, da mesma
 * forma (removendo a margem, média entre casas de apostas).
 */
function devigTotals(event) {
  const results = [];

  for (const bookmaker of event.bookmakers || []) {
    const totals = bookmaker.markets?.find((m) => m.key === 'totals');
    if (!totals) continue;

    const over = totals.outcomes.find((o) => normalize(o.name) === 'over' && o.point === 2.5);
    const under = totals.outcomes.find((o) => normalize(o.name) === 'under' && o.point === 2.5);
    if (!over || !under) continue;

    const invOver = 1 / over.price;
    const invUnder = 1 / under.price;
    const total = invOver + invUnder;

    results.push({ over25Goals: invOver / total, under25Goals: invUnder / total });
  }

  if (!results.length) return null;

  const avg = (key) => results.reduce((sum, r) => sum + r[key], 0) / results.length;
  return { over25Goals: avg('over25Goals'), under25Goals: avg('under25Goals') };
}

/**
 * Busca as probabilidades implícitas do mercado de apostas (médias entre
 * casas de apostas, com a margem da casa removida) para um confronto
 * específico. Retorna null se a partida não tiver odds disponíveis na Odds
 * API (ex: ainda não foram publicadas, fase futura do mata-mata, ou já
 * terminou) — quem chamar deve então usar o modelo estatístico como reserva.
 */
async function getMarketProbabilities(sportKey, homeTeam, awayTeam) {
  let events;
  try {
    events = await getCachedOdds(sportKey);
  } catch (err) {
    return null; // sem odds disponíveis (chave inválida, sem cobertura, etc.)
  }

  const match = findMatchingEvent(events, homeTeam, awayTeam);
  if (!match) return null;

  const h2h = devigH2H(match.event);
  if (!h2h) return null;

  const probabilities = match.sameOrder
    ? { homeWin: h2h.homeWin, draw: h2h.draw, awayWin: h2h.awayWin }
    : { homeWin: h2h.awayWin, draw: h2h.draw, awayWin: h2h.homeWin };

  const totals = devigTotals(match.event);

  return {
    ...probabilities,
    ...(totals || {}),
    numBookmakers: h2h.numBookmakers,
  };
}

module.exports = { getMarketProbabilities };
