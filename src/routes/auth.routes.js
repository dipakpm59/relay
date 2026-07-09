const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const limits = require('../middleware/rateLimiter.middleware');

router.post('/register', limits.auth, ctrl.register);
router.post('/login', limits.auth, ctrl.login);
router.post('/admin/login', limits.auth, ctrl.adminLogin);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);

module.exports = router;
