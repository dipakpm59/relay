const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

router.use(requireAuth, requireAdmin);

router.get('/overview', ctrl.overview);
router.get('/rooms', ctrl.listRooms);
router.patch('/rooms/:id/archive', ctrl.archiveRoom);
router.patch('/rooms/:id/restore', ctrl.restoreRoom);
router.get('/users', ctrl.listUsers);
router.patch('/users/:id/unlock', ctrl.unlockUser);
router.patch('/users/:id', ctrl.setUserActive);
router.get('/messages', ctrl.listMessages);
router.delete('/messages/:id', ctrl.removeMessage);
router.patch('/messages/:id/restore', ctrl.restoreMessage);
router.get('/logs', ctrl.auditLog);

module.exports = router;
