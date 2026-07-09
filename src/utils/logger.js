const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const streams = {
  app: fs.createWriteStream(path.join(LOG_DIR, 'app.log'), { flags: 'a' }),
  error: fs.createWriteStream(path.join(LOG_DIR, 'error.log'), { flags: 'a' }),
  request: fs.createWriteStream(path.join(LOG_DIR, 'request.log'), { flags: 'a' }),
};

function line(level, msg, meta) {
  const extra = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${new Date().toISOString()} [${level}] ${msg}${extra}\n`;
}

module.exports = {
  info(msg, meta) {
    const l = line('INFO', msg, meta);
    process.stdout.write(l);
    streams.app.write(l);
  },
  warn(msg, meta) {
    const l = line('WARN', msg, meta);
    process.stdout.write(l);
    streams.app.write(l);
  },
  error(msg, meta) {
    const l = line('ERROR', msg, meta);
    process.stderr.write(l);
    streams.error.write(l);
  },
  requestStream: streams.request,
};
