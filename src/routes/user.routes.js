const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.use(requireAuth);
router.get('/me', ctrl.profile);
router.patch('/me', ctrl.updateName);
router.patch('/me/password', ctrl.changePassword);

module.exports = router;
