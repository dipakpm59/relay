/**
 * npm run db:init — creates the database (local dev), applies migrations/
 * in order, tracked in schema_migrations. Works locally and on Railway.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function main() {
  const server = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });
  await server.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await server.end();

  const conn = await mysql.createConnection({ ...env.db, multipleStatements: true });
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(255) PRIMARY KEY,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`
  );

  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const [applied] = await conn.query('SELECT name FROM schema_migrations');
  const done = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) {
      console.log(`= ${file} (already applied)`);
      continue;
    }
    await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`+ ${file}`);
  }

  console.log('Database ready. Next: npm run db:seed (creates the admin account).');
  await conn.end();
}

main().catch((err) => {
  console.error('db:init failed:', err.message);
  process.exit(1);
});
