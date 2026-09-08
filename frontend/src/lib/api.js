/**
 * Single place where the UI talks to the backend.
 *
 * Every screen imports one of the exported API objects and never calls fetch
 * directly, so swapping the mock adapter for the live Express API is a one-line
 * change (VITE_USE_MOCK=false in .env).
 */
import {
  MOCK_AGENCIES,
  MOCK_ROLES,
  MOCK_USERS,
  MOCK_PERMISSIONS,
  MOCK_EMAIL_VERIFICATIONS,
} from '../data/mock';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const TOKEN_KEY = 'aa.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Thin fetch wrapper: attaches the bearer token and unwraps { success, data }. */
async function request(path, { method = 'GET', body, headers } = {}) {
  const token = tokenStore.get();
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok || payload.success === false) {
    const error = new Error(payload.message || 'Request failed (' + res.status + ')');
    error.status = res.status;
    error.errors = payload.errors;
    throw error;
  }
  return payload;
}

// --- mock helpers -----------------------------------------------------------
const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
let agencies = clone(MOCK_AGENCIES);
let users = clone(MOCK_USERS);
let roles = clone(MOCK_ROLES);
let permissions = clone(MOCK_PERMISSIONS);
let emails = clone(MOCK_EMAIL_VERIFICATIONS);
let seq = 1048;
const newCode = () => String(Math.floor(100000 + Math.random() * 900000));
let mockOtp = newCode(); // regenerated on every mock login / step / resend
let mockStage = null; // 'phone' -> 'email' -> null, mirrors the real flow

const ok = (data, message) => ({ success: true, data, message });

// --- Auth -------------------------------------------------------------------
export const authApi = {
  async login({ username, password, remember }) {
    if (!USE_MOCK) return request('/auth/login', { method: 'POST', body: { username, password, remember } });
    await delay();
    if (password.length < 6) {
      const e = new Error('Invalid username or password.');
      e.status = 401;
      throw e;
    }
    mockOtp = newCode();
    mockStage = 'phone';
    return ok({
      nextStep: 'phone',
      challengeId: 'chg_' + Date.now(),
      channel: 'sms',
      maskedPhone: '078 XXX 1850',
      resendCooldown: 59,
      devCode: mockOtp, // shown on screen while delivery is not wired up
    });
  },

  /** Step 2: phone code accepted -> hands back the email challenge, no token. */
  async verifyOtp({ challengeId, code }) {
    if (!USE_MOCK) return request('/auth/verify-otp', { method: 'POST', body: { challengeId, code } });
    await delay();
    if (mockStage !== 'phone') {
      const e = new Error('Wrong verification step for this session.');
      e.status = 400;
      throw e;
    }
    if (code !== mockOtp) {
      const e = new Error('That code is incorrect or has expired.');
      e.status = 400;
      throw e;
    }

    mockOtp = newCode();
    mockStage = 'email';
    return ok(
      {
        verified: 'phone',
        nextStep: 'email',
        challengeId: 'chg_' + Date.now(),
        channel: 'email',
        maskedEmail: 'vi******@gmail.com',
        resendCooldown: 59,
        devCode: mockOtp,
      },
      'Phone number verified. Now confirm your email address.'
    );
  },

  /** Step 3: email code accepted -> session token issued. */
  async verifyEmail({ challengeId, code }) {
    if (!USE_MOCK) return request('/auth/verify-email', { method: 'POST', body: { challengeId, code } });
    await delay();
    if (mockStage !== 'email') {
      const e = new Error('Verify your phone number before confirming your email.');
      e.status = 400;
      throw e;
    }
    if (code !== mockOtp) {
      const e = new Error('That code is incorrect or has expired.');
      e.status = 400;
      throw e;
    }

    mockStage = null;
    return ok({
      verified: 'email',
      nextStep: 'dashboard',
      token: 'mock.jwt.token',
      admin: { id: 'US-2001', name: 'Ishara Bandara', email: 'visaltheekshana555@gmail.com', role: 'Main Admin' },
    });
  },

  async resendOtp({ challengeId }) {
    if (!USE_MOCK) return request('/auth/resend-otp', { method: 'POST', body: { challengeId } });
    await delay(400);
    mockOtp = newCode();
    return ok(
      { resentAt: new Date().toISOString(), channel: mockStage, cooldown: 59, devCode: mockOtp },
      'A new code has been sent.'
    );
  },

  async me() {
    if (!USE_MOCK) return request('/auth/me');
    await delay(200);
    return ok({ id: 'US-2001', name: 'Ishara Bandara', email: 'visaltheekshana555@gmail.com', role: 'Main Admin' });
  },
};

// --- Agencies ---------------------------------------------------------------
export const agencyApi = {
  async list({ status = 'all', search = '' } = {}) {
    if (!USE_MOCK) return request('/agencies?status=' + status + '&search=' + encodeURIComponent(search));
    await delay(350);
    const term = search.trim().toLowerCase();
    const rows = agencies.filter(
      (a) =>
        (status === 'all' || a.status === status) &&
        (!term ||
          a.name.toLowerCase().includes(term) ||
          a.username.toLowerCase().includes(term) ||
          a.code.toLowerCase().includes(term))
    );
    return ok(rows);
  },

  async counts() {
    if (!USE_MOCK) return request('/agencies/counts');
    await delay(200);
    return ok({
      all: agencies.length,
      pending: agencies.filter((a) => a.status === 'pending').length,
      active: agencies.filter((a) => a.status === 'active').length,
      deactivated: agencies.filter((a) => a.status === 'deactivated').length,
    });
  },

  async create(payload) {
    if (!USE_MOCK) return request('/agencies', { method: 'POST', body: payload });
    await delay(700);
    if (agencies.some((a) => a.username === payload.username)) {
      const e = new Error('That username is already taken.');
      e.status = 409;
      throw e;
    }
    seq += 1;
    const code = payload.name.slice(0, 3).toUpperCase() + '-' + seq;
    const record = {
      id: 'AG-' + seq,
      name: payload.name,
      code,
      address: payload.address,
      username: payload.username,
      contact: '—',
      email: '—',
      users: 0,
      status: 'pending',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    agencies = [record, ...agencies];
    return ok({
      ...record,
      credentials: {
        username: payload.username,
        password: payload.password,
        loginUrl: window.location.origin + '/agency/login',
      },
    });
  },

  async updateStatus(id, status) {
    if (!USE_MOCK) return request('/agencies/' + id + '/status', { method: 'PATCH', body: { status } });
    await delay(400);
    agencies = agencies.map((a) => (a.id === id ? { ...a, status } : a));
    return ok(agencies.find((a) => a.id === id));
  },

  async resetCredentials(id) {
    if (!USE_MOCK) return request('/agencies/' + id + '/credentials/reset', { method: 'POST' });
    await delay(500);
    const agency = agencies.find((a) => a.id === id);
    return ok({
      username: agency.username,
      password: 'Tmp' + Math.random().toString(36).slice(2, 8) + '9!',
      loginUrl: window.location.origin + '/agency/login',
    });
  },
};

// --- Users ------------------------------------------------------------------
export const userApi = {
  async list({ role = 'all', status = 'all', search = '' } = {}) {
    if (!USE_MOCK) return request('/users?role=' + role + '&status=' + status + '&search=' + encodeURIComponent(search));
    await delay(350);
    const term = search.trim().toLowerCase();
    const rows = users.filter(
      (u) =>
        (role === 'all' || u.role === role) &&
        (status === 'all' || u.status === status) &&
        (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    );
    return ok(rows);
  },

  async create(payload) {
    if (!USE_MOCK) return request('/users', { method: 'POST', body: payload });
    await delay(500);
    const record = {
      id: 'US-' + (2000 + users.length + 1),
      status: 'pending',
      lastLogin: '—',
      agency: payload.agency || '—',
      ...payload,
    };
    users = [record, ...users];
    return ok(record);
  },

  async updateStatus(id, status) {
    if (!USE_MOCK) return request('/users/' + id + '/status', { method: 'PATCH', body: { status } });
    await delay(300);
    users = users.map((u) => (u.id === id ? { ...u, status } : u));
    return ok(users.find((u) => u.id === id));
  },

  async remove(id) {
    if (!USE_MOCK) return request('/users/' + id, { method: 'DELETE' });
    await delay(300);
    users = users.filter((u) => u.id !== id);
    return ok({ id });
  },
};

// --- Roles & permissions ----------------------------------------------------
export const roleApi = {
  async list() {
    if (!USE_MOCK) return request('/roles');
    await delay(300);
    return ok(roles);
  },

  async create(payload) {
    if (!USE_MOCK) return request('/roles', { method: 'POST', body: payload });
    await delay(450);
    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (roles.some((r) => r.slug === slug)) {
      const e = new Error('A role with that name already exists.');
      e.status = 409;
      throw e;
    }
    const record = { id: 'RL-' + (roles.length + 1).toString().padStart(2, '0'), slug, users: 0, system: false, ...payload };
    roles = [...roles, record];
    permissions = {
      ...permissions,
      [slug]: Object.fromEntries(
        ['agencies', 'users', 'roles', 'reports', 'billing', 'settings'].map((m) => [
          m,
          { view: false, create: false, edit: false, delete: false },
        ])
      ),
    };
    return ok(record);
  },

  async remove(id) {
    if (!USE_MOCK) return request('/roles/' + id, { method: 'DELETE' });
    await delay(300);
    roles = roles.filter((r) => r.id !== id);
    return ok({ id });
  },

  async permissions(slug) {
    if (!USE_MOCK) return request('/roles/' + slug + '/permissions');
    await delay(300);
    return ok(permissions[slug] || {});
  },

  async savePermissions(slug, matrix) {
    if (!USE_MOCK) return request('/roles/' + slug + '/permissions', { method: 'PUT', body: { permissions: matrix } });
    await delay(600);
    permissions = { ...permissions, [slug]: clone(matrix) };
    return ok(permissions[slug], 'Permissions updated.');
  },
};

// --- Email verification -----------------------------------------------------
export const verificationApi = {
  async listEmails({ status = 'all', search = '' } = {}) {
    if (!USE_MOCK) return request('/verification/emails?status=' + status + '&search=' + encodeURIComponent(search));
    await delay(350);
    const term = search.trim().toLowerCase();
    const rows = emails.filter(
      (e) =>
        (status === 'all' || e.status === status) &&
        (!term || e.email.toLowerCase().includes(term) || e.name.toLowerCase().includes(term))
    );
    return ok(rows);
  },

  async resendEmail(id) {
    if (!USE_MOCK) return request('/verification/emails/' + id + '/resend', { method: 'POST' });
    await delay(450);
    emails = emails.map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1 } : e));
    return ok({ id }, 'Verification email sent.');
  },

  async markVerified(id) {
    if (!USE_MOCK) return request('/verification/emails/' + id + '/verify', { method: 'PATCH' });
    await delay(400);
    emails = emails.map((e) => (e.id === id ? { ...e, status: 'verified' } : e));
    return ok(emails.find((e) => e.id === id), 'Email marked as verified.');
  },
};

// --- Dashboard --------------------------------------------------------------
export const dashboardApi = {
  async stats() {
    if (!USE_MOCK) return request('/dashboard/stats');
    await delay(300);
    return ok({
      agencies: { total: agencies.length, delta: '+12%' },
      pending: { total: agencies.filter((a) => a.status === 'pending').length, delta: '+2' },
      users: { total: users.length, delta: '+8%' },
      unverified: { total: emails.filter((e) => e.status !== 'verified').length, delta: '-3' },
    });
  },
};
