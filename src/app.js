const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const logger = require('./utils/logger');
const sec = require('./middleware/security.middleware');
const limits = require('./middleware/rateLimiter.middleware');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.set('trust proxy', 1); // Railway/reverse proxy → correct req.ip & secure cookies

app.use(sec.helmetConfig);
app.use(sec.corsConfig);
app.use(sec.compress);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());
app.use(sec.hppGuard);
app.use(sec.xssSanitizer);

app.use(morgan(env.isProd ? 'combined' : 'dev', { stream: logger.requestStream }));
if (!env.isProd) app.use(morgan('dev'));

app.use('/assets', express.static(path.join(__dirname, '..', 'views', 'assets')));

app.use('/api', limits.general);
app.use('/', require('./routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
