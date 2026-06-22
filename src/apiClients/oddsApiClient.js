const axios = require('axios');
const config = require('../config');

const client = axios.create({
  baseURL: config.oddsApiBaseUrl,
  timeout: 10000,
});

/**
 * Lista todos os esportes/ligas disponíveis na The Odds API.
 */
async function listSports() {
  const { data } = await client.get('/sports', {
    params: { apiKey: config.oddsApiKey },
  });
  return data;
}

/**
 * Busca odds (mercados) de uma liga específica.
 * sportKey ex: "soccer_epl", "soccer_brazil_campeonato"
 */
async function getOdds(sportKey, { regions, markets } = {}) {
  const { data } = await client.get(`/sports/${sportKey}/odds`, {
    params: {
      apiKey: config.oddsApiKey,
      regions: regions || config.defaultRegions,
      markets: markets || config.defaultMarkets,
      oddsFormat: 'decimal',
    },
  });
  return data;
}

/**
 * Busca odds de um evento (partida) específico dentro de uma liga.
 */
async function getEventOdds(sportKey, eventId, { regions, markets } = {}) {
  const events = await getOdds(sportKey, { regions, markets });
  return events.find((event) => event.id === eventId) || null;
}

/**
 * Busca placares/resultados recentes de uma liga.
 * Nota: no plano gratuito da The Odds API, "daysFrom" cobre poucos dias
 * de histórico. Por isso sincronizamos periodicamente (ver jobs/syncScores.js)
 * para construir um histórico próprio com o tempo.
 */
async function getScores(sportKey, { daysFrom } = {}) {
  const { data } = await client.get(`/sports/${sportKey}/scores`, {
    params: {
      apiKey: config.oddsApiKey,
      daysFrom: daysFrom || 3,
    },
  });
  return data;
}

module.exports = { listSports, getOdds, getEventOdds, getScores };
