/**
 * Creates the schema in the `agency` database and seeds the Main Admin.
 *
 *   npm run db:migrate
 *
 * Safe to run repeatedly: the DDL uses CREATE TABLE IF NOT EXISTS and the seed
 * skips accounts that already exist.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('../src/config/db');
const userModel = require('../src/models/user.model');

const SEED_ADMIN = {
  name: process.env.SEED_ADMIN_NAME || 'Main Admin',
  email: process.env.SEED_ADMIN_EMAIL || 'visaltheekshana555@gmail.com',
  phone: process.env.SEED_ADMIN_PHONE || '0781311850',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
  roleSlug: 'main_admin',
  status: 'active',
};

(async () => {
  console.log('');
  try {
    const conn = await testConnection();
    console.log('  Connected to database "' + conn.database + '"');
  } catch (err) {
    console.error('  Could not connect to MySQL: ' + err.message);
    console.error('  Is MySQL running in the XAMPP control panel?\n');
    process.exit(1);
  }

  // --- schema ---------------------------------------------------------------
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

  // Comments must go before splitting on ';' - a semicolon inside a comment
  // would otherwise cut a statement in half.
  const statements = sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }
  console.log('  Schema applied (' + statements.length + ' statement(s))');

  const tables = await pool.query('SHOW TABLES');
  console.log('  Tables now present: ' + tables[0].map((t) => Object.values(t)[0]).join(', '));

  // --- seed -----------------------------------------------------------------
  if (await userModel.emailExists(SEED_ADMIN.email)) {
    console.log('  Admin already exists, seed skipped (' + SEED_ADMIN.email + ')');
  } else {
    const admin = await userModel.create(SEED_ADMIN);
    console.log('  Seeded Main Admin #' + admin.id + ' (' + admin.email + ')');
    console.log('  Password: ' + SEED_ADMIN.password + '  <- change this after signing in');
  }

  console.log('\n  Done.\n');
  await pool.end();
})().catch(async (err) => {
  console.error('\n  Migration failed: ' + err.message + '\n');
  await pool.end().catch(() => {});
  process.exit(1);
});
