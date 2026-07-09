const router = require('express').Router();
const ctrl = require('../controllers/room.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const limits = require('../middleware/rateLimiter.middleware');

router.use(requireAuth);

router.post('/', limits.rooms, ctrl.create);
router.get('/', ctrl.mine);
router.post('/join', ctrl.join);
router.get('/:id/qr', ctrl.qr);
router.get('/:id/members', ctrl.members);
router.get('/:id/messages', ctrl.olderMessages);
router.post('/:id/leave', ctrl.leave);
router.patch('/:id/archive', ctrl.archive);
router.patch('/:id/restore', ctrl.restore);
router.patch('/:id', ctrl.rename);

module.exports = router;
