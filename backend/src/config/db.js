const mysql = require('mysql2/promise');

/**
 * Shared MySQL connection pool.
 *
 * XAMPP defaults are baked in (root with an empty password), so the app runs
 * out of the box; override any of them in backend/.env.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'agency',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  // Return DATETIME columns as strings so responses do not shift with the
  // server's timezone.
  dateStrings: true,
});

/** Convenience wrapper: returns just the rows. */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Returns the first row, or null. */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Verifies the database is reachable; used at boot and by the migrator. */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return { ok: true, database: process.env.DB_NAME || 'agency' };
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, testConnection };
