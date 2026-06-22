const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const config = require('./config');

const sportsRoutes = require('./routes/sports');
const oddsRoutes = require('./routes/odds');
const scoresRoutes = require('./routes/scores');
const fixturesRoutes = require('./routes/fixtures');
const standingsRoutes = require('./routes/standings');
const predictionsRoutes = require('./routes/predictions');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(morgan('dev'));
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'football-predict-api',
    endpoints: [
      'GET /api/sports',
      'GET /api/odds/:sportKey',
      'GET /api/odds/:sportKey/:eventId',
      'GET /api/scores/:sportKey',
      'GET /api/fixtures/:competitionCode',
      'GET /api/standings/:competitionCode',
      'GET /api/standings/:competitionCode/team/:teamName',
      'GET /api/predictions/:sportKey?home=&away=',
    ],
  });
});

app.use('/api/sports', sportsRoutes);
app.use('/api/odds', oddsRoutes);
app.use('/api/scores', scoresRoutes);
app.use('/api/fixtures', fixturesRoutes);
app.use('/api/standings', standingsRoutes);
app.use('/api/predictions', predictionsRoutes);

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`football-predict-api rodando em http://localhost:${config.port}`);
});
