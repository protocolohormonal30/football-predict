const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { predictMatch } = require('../services/predictionService');

/**
 * GET /api/predictions/:sportKey?home=Team&away=Team
 */
router.get(
  '/:sportKey',
  asyncHandler(async (req, res) => {
    const { home, away } = req.query;
    if (!home || !away) {
      return res.status(400).json({
        error: 'Os parâmetros de query "home" e "away" são obrigatórios (nomes dos times).',
      });
    }
    const prediction = await predictMatch(req.params.sportKey, home, away);
    res.json(prediction);
  })
);

module.exports = router;
