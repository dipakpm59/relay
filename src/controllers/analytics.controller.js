const analyticsService = require('../services/analytics.service');
const asyncHandler = require('../utils/asyncHandler');

exports.mySummary = asyncHandler(async (req, res) => {
  res.json(await analyticsService.mySummary(req.user));
});

exports.roomSeries = asyncHandler(async (req, res) => {
  res.json(await analyticsService.roomSeries(req.user, parseInt(req.params.id, 10)));
});
