const bcrypt = require('bcryptjs');
const { query, queryOne, pool } = require('../config/db');

/**
 * Users table access. Every method is async - controllers must await them.
 *
 * Rows are mapped to the shape the frontend already renders (id, name, email,
 * phone, role, agency, status, lastLogin) so the UI needed no changes when the
 * in-memory store was swapped for MySQL.
 */

const ROLE_LABELS = {
  main_admin: 'Main Admin',
  agency_owner: 'Agency Owner',
  agency_manager: 'Agency Manager',
  agent: 'Agent',
  auditor: 'Auditor',
};

const roleLabel = (slug) =>
  ROLE_LABELS[slug] || String(slug).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Public shape - the password hash never leaves this module. */
function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    roleSlug: row.role_slug,
    role: roleLabel(row.role_slug),
    agency: row.agency_name || null,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    phoneVerifiedAt: row.phone_verified_at,
    lastLogin: row.last_login_at,
    createdAt: row.created_at,
  };
}

const SELECT = 'SELECT * FROM users';

/** Full row including password_hash - only for the login check. */
async function findByEmailWithHash(email) {
  return queryOne(SELECT + ' WHERE email = ? LIMIT 1', [String(email).trim().toLowerCase()]);
}

/** Accepts an email or a phone number, so people can sign in with either. */
async function findByLoginWithHash(identifier) {
  const value = String(identifier || '').trim();
  const digits = value.replace(/\D/g, '');

  return queryOne(SELECT + ' WHERE email = ? OR REPLACE(REPLACE(phone, " ", ""), "+", "") = ? LIMIT 1', [
    value.toLowerCase(),
    digits,
  ]);
}

async function findById(id) {
  return toPublic(await queryOne(SELECT + ' WHERE id = ? LIMIT 1', [id]));
}

async function emailExists(email) {
  const row = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [
    String(email).trim().toLowerCase(),
  ]);
  return Boolean(row);
}

async function phoneExists(phone) {
  const row = await queryOne(
    'SELECT id FROM users WHERE REPLACE(REPLACE(phone, " ", ""), "+", "") = ? LIMIT 1',
    [String(phone).replace(/\D/g, '')]
  );
  return Boolean(row);
}

/** Filtered list for the Users screen. */
async function findAll({ role = 'all', status = 'all', search = '' } = {}) {
  const where = [];
  const params = [];

  if (role !== 'all') {
    where.push('role_slug = ?');
    params.push(role);
  }
  if (status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (search.trim()) {
    where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const like = '%' + search.trim() + '%';
    params.push(like, like, like);
  }

  const sql =
    SELECT +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY created_at DESC, id DESC';

  return (await query(sql, params)).map(toPublic);
}

/** Hashes the password and inserts the account. */
async function create({ name, email, phone, password, roleSlug = 'agent', agency = null, status = 'pending' }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await pool.execute(
    `INSERT INTO users (name, email, phone, password_hash, role_slug, agency_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      String(email).trim().toLowerCase(),
      phone.trim(),
      passwordHash,
      roleSlug,
      agency,
      status,
    ]
  );

  return findById(result.insertId);
}

/** Partial update. Only known columns are written. */
async function update(id, patch = {}) {
  const COLUMNS = {
    name: 'name',
    email: 'email',
    phone: 'phone',
    roleSlug: 'role_slug',
    agency: 'agency_name',
    status: 'status',
    emailVerifiedAt: 'email_verified_at',
    phoneVerifiedAt: 'phone_verified_at',
    lastLogin: 'last_login_at',
  };

  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(COLUMNS)) {
    if (patch[key] !== undefined) {
      sets.push(column + ' = ?');
      params.push(patch[key]);
    }
  }

  if (patch.password) {
    sets.push('password_hash = ?');
    params.push(await bcrypt.hash(patch.password, 10));
  }

  if (sets.length === 0) return findById(id);

  params.push(id);
  await pool.execute('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?', params);
  return findById(id);
}

async function remove(id) {
  const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function countByRole(roleSlug) {
  const row = await queryOne('SELECT COUNT(*) AS total FROM users WHERE role_slug = ?', [roleSlug]);
  return Number(row.total);
}

async function total() {
  const row = await queryOne('SELECT COUNT(*) AS total FROM users');
  return Number(row.total);
}

/** Compares a plain password against the stored bcrypt hash. */
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

module.exports = {
  toPublic,
  roleLabel,
  findById,
  findByEmailWithHash,
  findByLoginWithHash,
  emailExists,
  phoneExists,
  findAll,
  create,
  update,
  remove,
  countByRole,
  total,
  verifyPassword,
};
