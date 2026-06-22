require('dotenv').config();

// Mapeia a "sportKey" da The Odds API (ex: soccer_epl) para o código de
// competição da football-data.org (ex: PL).
const DEFAULT_COMPETITION_MAP = {
  soccer_epl: 'PL',
  soccer_efl_champ: 'ELC',
  soccer_spain_la_liga: 'PD',
  soccer_italy_serie_a: 'SA',
  soccer_germany_bundesliga: 'BL1',
  soccer_france_ligue_one: 'FL1',
  soccer_brazil_campeonato: 'BSA',
  soccer_uefa_champs_league: 'CL',
  soccer_netherlands_eredivisie: 'DED',
  soccer_portugal_primeira_liga: 'PPL',
  soccer_fifa_world_cup: 'WC',
};

function parseCompetitionMap() {
  if (!process.env.COMPETITION_MAP) return DEFAULT_COMPETITION_MAP;
  try {
    return { ...DEFAULT_COMPETITION_MAP, ...JSON.parse(process.env.COMPETITION_MAP) };
  } catch (e) {
    console.warn('[config] COMPETITION_MAP inválido (não é JSON), usando mapeamento padrão.');
    return DEFAULT_COMPETITION_MAP;
  }
}

const config = {
  port: process.env.PORT || 3000,

  // The Odds API (odds de casas de apostas)
  oddsApiKey: process.env.ODDS_API_KEY,
  oddsApiBaseUrl: 'https://api.the-odds-api.com/v4',
  defaultRegions: process.env.ODDS_REGIONS || 'eu',
  defaultMarkets: process.env.ODDS_MARKETS || 'h2h,totals',

  // football-data.org (fixtures, resultados e classificação)
  footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY,
  footballDataBaseUrl: 'https://api.football-data.org/v4',
  competitionMap: parseCompetitionMap(),

  // Tempo (ms) que os dados da football-data.org ficam guardados em memória
  // antes de buscar de novo. Evita esbarrar no limite de 10 req/min do
  // plano gratuito quando há várias consultas seguidas em pouco tempo.
  cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000, // 10 min

  // Origem(ns) liberada(s) para chamar esta API direto do navegador (CORS).
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

if (!config.oddsApiKey) {
  console.warn(
    '[config] AVISO: ODDS_API_KEY não definida no .env. As chamadas à The Odds API vão falhar.'
  );
}

if (!config.footballDataApiKey) {
  console.warn(
    '[config] AVISO: FOOTBALL_DATA_API_KEY não definida no .env. As chamadas à football-data.org vão falhar.'
  );
}

module.exports = config;
