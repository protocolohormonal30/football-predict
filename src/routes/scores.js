const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { getScores } = require('../apiClients/oddsApiClient');

/**
 * GET /api/scores/:sportKey?daysFrom=3
 * Placares recentes direto da The Odds API.
 */
router.get(
  '/:sportKey',
  asyncHandler(async (req, res) => {
    const { daysFrom } = req.query;
    const scores = await getScores(req.params.sportKey, {
      daysFrom: daysFrom ? Number(daysFrom) : undefined,
    });
    res.json(scores);
  })
);

module.exports = router;
