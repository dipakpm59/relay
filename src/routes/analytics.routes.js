const router = require('express').Router();
const ctrl = require('../controllers/analytics.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.use(requireAuth);
router.get('/summary', ctrl.mySummary);
router.get('/rooms/:id', ctrl.roomSeries);

module.exports = router;
