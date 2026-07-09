const path = require('path');
const router = require('express').Router();

const VIEWS = path.join(__dirname, '..', '..', 'views');
const page = (file) => (_req, res) => res.sendFile(path.join(VIEWS, file));

// Server-rendered pages
router.get('/', page('index.html'));
router.get('/login', page('login.html'));
router.get('/chat', page('chat.html'));
router.get('/account', page('account.html'));
router.get('/analytics', page('analytics.html'));
router.get('/admin', page('admin.html'));
router.get('/join/:code', page('join.html')); // invite links land here

// API
router.use('/api/auth', require('./auth.routes'));
router.use('/api/users', require('./user.routes'));
router.use('/api/rooms', require('./room.routes'));
router.use('/api/messages', require('./message.routes'));
router.use('/api/analytics', require('./analytics.routes'));
router.use('/api/admin', require('./admin.routes'));

router.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

module.exports = router;
