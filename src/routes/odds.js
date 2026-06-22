const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { getOdds, getEventOdds } = require('../apiClients/oddsApiClient');

/**
 * GET /api/odds/:sportKey?regions=eu&markets=h2h,totals
 * Odds de todas as partidas futuras de uma liga.
 */
router.get(
  '/:sportKey',
  asyncHandler(async (req, res) => {
    const { regions, markets } = req.query;
    const odds = await getOdds(req.params.sportKey, { regions, markets });
    res.json(odds);
  })
);

/**
 * GET /api/odds/:sportKey/:eventId
 * Odds de uma partida específica.
 */
router.get(
  '/:sportKey/:eventId',
  asyncHandler(async (req, res) => {
    const { regions, markets } = req.query;
    const event = await getEventOdds(req.params.sportKey, req.params.eventId, { regions, markets });
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(event);
  })
);

module.exports = router;
