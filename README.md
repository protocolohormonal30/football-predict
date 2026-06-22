# football-predict-api

API em Node.js/Express que combina **odds** (The Odds API) e **classificação,
fixtures e previsões de partidas** (football-data.org, modelo de Poisson).

## Arquitetura (importante)

Esta API busca os dados **ao vivo**, a cada pedido, direto na football-data.org,
guardando o resultado em **cache de memória** por alguns minutos
(`CACHE_TTL_MS`, padrão 10 min). Não usa banco de dados.

Isso é intencional: serviços gratuitos (Render free, por exemplo) têm
**disco efêmero** — qualquer banco de dados local salvo em arquivo (como
SQLite) é apagado sempre que a instância reinicia ou "dorme" por
inatividade. Depender de um banco local nesse tipo de hospedagem causa
resultados inconsistentes (funciona, depois "esquece", sincroniza de novo).
Por isso a abordagem aqui é deliberadamente simples: sem persistência, sem
tarefas agendadas, só busca + cache curto. Para o volume de uso esperado
(uma ferramenta interna de consulta, não um produto de alto tráfego), isso é
suficiente e muito mais confiável.

## Instalação

```bash
npm install
cp .env.example .env
# edite o .env: ODDS_API_KEY e FOOTBALL_DATA_API_KEY
npm run dev      # com nodemon, recarrega ao salvar
# ou
npm start
```

O servidor sobe em `http://localhost:3000` (porta configurável via `PORT`).

⚠️ A football-data.org tem limite de **10 requisições/minuto** no plano
gratuito. O cache em memória evita repetir chamadas em consultas seguidas —
mas se você fizer muitas consultas diferentes (times/competições distintas)
em menos de um minuto, pode esbarrar no limite. Para uso pontual (ex: um
Superadmin consultando previsões), isso não deve ser um problema.

## Estrutura

```
src/
  server.js                    # bootstrap do Express
  config.js                    # variáveis de ambiente + mapeamento de competições
  apiClients/
    oddsApiClient.js           # integração com The Odds API
    footballDataClient.js      # integração com a football-data.org
  services/
    footballDataStatsService.js # busca ao vivo + cache em memória
    predictionService.js        # modelo de Poisson para previsões
  utils/
    poisson.js                  # função de probabilidade de Poisson
    teamNameMatcher.js          # normalização/matching de nomes de time
  routes/
    sports.js, odds.js, scores.js, fixtures.js, standings.js, predictions.js
  middleware/
    asyncHandler.js, errorHandler.js
```

## Mapeamento de competições

`sportKey` (Odds API) ↔ `competitionCode` (football-data.org), em
`src/config.js` (`DEFAULT_COMPETITION_MAP`):

```js
soccer_epl                    -> PL    // Premier League
soccer_spain_la_liga          -> PD    // La Liga
soccer_italy_serie_a          -> SA    // Serie A
soccer_germany_bundesliga     -> BL1   // Bundesliga
soccer_france_ligue_one       -> FL1   // Ligue 1
soccer_brazil_campeonato      -> BSA   // Brasileirão
soccer_uefa_champs_league     -> CL    // Champions League
soccer_netherlands_eredivisie -> DED   // Eredivisie
soccer_portugal_primeira_liga -> PPL   // Primeira Liga
soccer_fifa_world_cup         -> WC    // Copa do Mundo
```

Sobrescreva via env `COMPETITION_MAP` (JSON) se precisar de outro código.

## Endpoints

### Ligas disponíveis (Odds API)
```
GET /api/sports
```

### Odds
```
GET /api/odds/:sportKey?regions=eu&markets=h2h,totals
GET /api/odds/:sportKey/:eventId
```

### Placares recentes (Odds API)
```
GET /api/scores/:sportKey?daysFrom=3
```

### Fixtures (football-data.org)
```
GET /api/fixtures/:competitionCode?status=SCHEDULED&dateFrom=&dateTo=
```

### Classificação (football-data.org)
```
GET /api/standings/:competitionCode
GET /api/standings/:competitionCode/team/:teamName
```

### Previsões
```
GET /api/predictions/:sportKey?home=Brazil&away=Argentina
```

Exemplo de resposta:
```json
{
  "sportKey": "soccer_fifa_world_cup",
  "homeTeam": "Brazil",
  "awayTeam": "Argentina",
  "source": "football-data.org",
  "expectedGoals": { "home": 1.42, "away": 1.1 },
  "probabilities": {
    "homeWin": 0.45,
    "draw": 0.27,
    "awayWin": 0.28,
    "over25Goals": 0.5,
    "under25Goals": 0.5
  },
  "mostLikelyScore": "1-1",
  "confidence": "média",
  "basedOn": { "homeMatchesPlayed": 2, "awayMatchesPlayed": 1, "leagueMatchesSampled": 39 }
}
```

## Como funciona o modelo de previsão

1. Calcula a média de gols (casa/fora) da competição, a partir das partidas
   finalizadas já disputadas.
2. Calcula "força de ataque" e "força de defesa" de cada time relativa a essa
   média — com **suavização estatística** (`SMOOTHING_GAMES = 4`): times com
   poucos jogos disputados (comum no início de um torneio) têm seus números
   "puxados" parcialmente para a média da competição, evitando previsões
   extremas (0% ou 100%) por causa de amostras pequenas.
3. Estima os gols esperados de cada time no confronto.
4. Usa a distribuição de Poisson para calcular a probabilidade de cada
   placar possível e soma por resultado (casa/empate/fora) e por mercado
   (over/under 2.5).

## Próximos passos sugeridos

- Adicionar autenticação simples se for expor publicamente.
- Endpoint de "valor esperado" comparando suas probabilidades com as odds do
  mercado.
- Se o tráfego crescer muito, considerar um serviço de cache externo
  (Redis) em vez do cache em memória.
