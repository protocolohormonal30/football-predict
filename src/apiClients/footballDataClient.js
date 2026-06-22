const axios = require('axios');
const config = require('../config');

const client = axios.create({
  baseURL: config.footballDataBaseUrl,
  timeout: 10000,
  headers: { 'X-Auth-Token': config.footballDataApiKey },
});

/**
 * Lista as partidas de uma competição.
 * competitionCode ex: "PL", "BSA", "PD", "SA", "BL1", "FL1", "CL"
 * status: SCHEDULED | LIVE | FINISHED | POSTPONED | CANCELLED | etc.
 */
async function getMatches(competitionCode, { status, dateFrom, dateTo, matchday } = {}) {
  const { data } = await client.get(`/competitions/${competitionCode}/matches`, {
    params: { status, dateFrom, dateTo, matchday },
  });
  return data;
}

/**
 * Classificação (tabela) atual de uma competição.
 */
async function getStandings(competitionCode) {
  const { data } = await client.get(`/competitions/${competitionCode}/standings`);
  return data;
}

/**
 * Detalhes de uma partida específica (inclui estatísticas quando disponíveis).
 */
async function getMatch(matchId) {
  const { data } = await client.get(`/matches/${matchId}`);
  return data;
}

/**
 * Lista as competições disponíveis para a sua API key.
 */
async function listCompetitions() {
  const { data } = await client.get('/competitions');
  return data;
}

module.exports = { getMatches, getStandings, getMatch, listCompetitions };
