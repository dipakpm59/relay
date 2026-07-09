const router = require('express').Router();
const ctrl = require('../controllers/message.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.use(requireAuth);
router.delete('/:id', ctrl.remove);
router.patch('/:id/restore', ctrl.restore);

module.exports = router;
