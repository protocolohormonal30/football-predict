const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { getStandingsTable, getStanding } = require('../services/footballDataStatsService');

/**
 * GET /api/standings/:competitionCode
 * Classificação completa de uma competição (busca ao vivo na football-data.org,
 * com cache de alguns minutos em memória).
 */
router.get(
  '/:competitionCode',
  asyncHandler(async (req, res) => {
    const table = await getStandingsTable(req.params.competitionCode);
    res.json(table);
  })
);

/**
 * GET /api/standings/:competitionCode/team/:teamName
 */
router.get(
  '/:competitionCode/team/:teamName',
  asyncHandler(async (req, res) => {
    const standing = await getStanding(req.params.competitionCode, req.params.teamName);
    if (!standing) return res.status(404).json({ error: 'Time não encontrado na tabela' });
    res.json(standing);
  })
);

module.exports = router;
