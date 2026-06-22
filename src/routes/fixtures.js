const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const footballData = require('../apiClients/footballDataClient');

/**
 * GET /api/fixtures/:competitionCode?status=SCHEDULED&dateFrom=&dateTo=
 * Partidas de uma competição direto da football-data.org.
 * competitionCode: códigos da football-data.org (ex: PL, BSA, PD, SA, BL1, FL1, CL)
 * status padrão: SCHEDULED (próximos jogos).
 */
router.get(
  '/:competitionCode',
  asyncHandler(async (req, res) => {
    const { status, dateFrom, dateTo, matchday } = req.query;
    const data = await footballData.getMatches(req.params.competitionCode, {
      status: status || 'SCHEDULED',
      dateFrom,
      dateTo,
      matchday,
    });
    res.json(data.matches || []);
  })
);

module.exports = router;
