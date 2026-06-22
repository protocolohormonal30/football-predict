const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { listSports } = require('../apiClients/oddsApiClient');

/**
 * GET /api/sports
 * Lista as ligas/competições de futebol disponíveis na The Odds API.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const sports = await listSports();
    const soccerOnly = sports.filter((s) => s.key.startsWith('soccer'));
    res.json(soccerOnly);
  })
);

module.exports = router;
