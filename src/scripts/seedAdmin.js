/** npm run db:seed — idempotent admin account from ADMIN_* in .env. */
require('dotenv').config();
const pool = require('../config/db');
const adminModel = require('../models/admin.model');
const password = require('../utils/password');

async function main() {
  const name = process.env.ADMIN_NAME || 'Administrator';
  const email = (process.env.ADMIN_EMAIL || 'admin@relay.local').toLowerCase();
  const plain = process.env.ADMIN_PASSWORD || 'ChangeMe123';

  await adminModel.upsertSeed({ name, email, passwordHash: await password.hash(plain) });
  console.log('Seed admin ready:');
  console.log(`  email:    ${email}`);
  console.log('  password: (ADMIN_PASSWORD from your .env)');
  console.log('  sign in at /login → "Admin" tab');
  await pool.end();
}

main().catch((err) => {
  console.error('db:seed failed:', err.message);
  process.exit(1);
});
