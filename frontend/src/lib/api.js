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
import { trackRequest } from './loading';
import { showLoading, hideLoading } from './alert';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const TOKEN_KEY = 'aa.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Shown when the API cannot be reached at all, which in development almost
 * always means XAMPP's Apache, which serves the Laravel API, is stopped. A
 * bare "500" here is the Vite proxy failing to connect, not an error the
 * server actually returned.
 */
const OFFLINE_MESSAGE =
  'Cannot reach the API server. Start Apache and MySQL in the XAMPP Control Panel.';

/**
 * A session can end mid-screen: the token expires, or a sign-in elsewhere
 * replaces it. The app registers one handler here (see AuthContext) so every
 * screen does not have to work out what a 401 means.
 */
let onSessionEnded = null;

export function setSessionEndedHandler(handler) {
  onSessionEnded = handler;
}

// The sign-in steps answer 401 for a wrong password or a stale code, which is
// a failed attempt rather than a session ending.
const SIGN_IN_PATH = /^\/auth\/(login|verify|resend|forgot)/;

/**
 * Thin fetch wrapper: attaches the bearer token and unwraps { success, data }.
 *
 * Every request shows as loading: reads move the bar along the top of the
 * screen, and anything that changes data holds a loading dialog until the
 * server has answered, so nothing is clicked twice. `background` is for the
 * polls nobody is waiting on, which show nothing.
 */
async function request(path, { method = 'GET', body, headers, background = false } = {}) {
  if (background) return send(path, { method, body, headers });

  const done = trackRequest();
  const blocking = method !== 'GET';
  if (blocking) showLoading();

  try {
    return await send(path, { method, body, headers });
  } finally {
    if (blocking) hideLoading();
    done();
  }
}

async function send(path, { method, body, headers }) {
  const token = tokenStore.get();

  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only rejects when the request never completed.
    const error = new Error(OFFLINE_MESSAGE);
    error.status = 0;
    throw error;
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok || payload?.success === false) {
    // The API always answers with a { success, message } envelope, so a 5xx
    // without one did not come from the application.
    const unreachable = payload === null && res.status >= 500;

    // A 401 anywhere else means the session is gone, so say so in words that
    // help - "Authentication required." reads like a bug on a filled-in form.
    const sessionEnded = res.status === 401 && !SIGN_IN_PATH.test(path);
    if (sessionEnded) onSessionEnded?.();

    const error = new Error(
      sessionEnded
        ? 'Your session has ended. Please sign in again.'
        : payload?.message ||
            (unreachable ? OFFLINE_MESSAGE : 'Request failed (' + res.status + ')'),
    );
    error.status = res.status;
    error.errors = payload?.errors;
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
  /*
   * There is deliberately no register(): accounts are never self-created.
   * The admin is seeded and agency logins are issued from the admin panel.
   */
  async login({ username, password, remember }) {
    if (!USE_MOCK)
      return request('/auth/login', { method: 'POST', body: { username, password, remember } });
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
      steps: ['phone', 'email'],
      challengeId: 'chg_' + Date.now(),
      channel: 'sms',
      maskedPhone: '077 XXX 0000',
      resendCooldown: 59,
      devCode: mockOtp, // shown on screen while delivery is not wired up
    });
  },

  /** Step 2: phone code accepted -> hands back the email challenge, no token. */
  async verifyOtp({ challengeId, code }) {
    if (!USE_MOCK)
      return request('/auth/verify-otp', { method: 'POST', body: { challengeId, code } });
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
        maskedEmail: 'ad***@example.com',
        resendCooldown: 59,
        devCode: mockOtp,
      },
      'Phone number verified. Now confirm your email address.',
    );
  },

  /** Step 3: email code accepted -> session token issued. */
  async verifyEmail({ challengeId, code }) {
    if (!USE_MOCK)
      return request('/auth/verify-email', { method: 'POST', body: { challengeId, code } });
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
      admin: {
        id: 'US-2001',
        name: 'Ishara Bandara',
        email: 'admin@example.com',
        role: 'Main Admin',
      },
    });
  },

  async resendOtp({ challengeId }) {
    if (!USE_MOCK) return request('/auth/resend-otp', { method: 'POST', body: { challengeId } });
    await delay(400);
    mockOtp = newCode();
    return ok(
      { resentAt: new Date().toISOString(), channel: mockStage, cooldown: 59, devCode: mockOtp },
      'A new code has been sent.',
    );
  },

  /*
   * Forgotten password: the username names the account, a code sent to its
   * email proves the person holds it, and only then is a new password taken.
   */
  async forgotPassword({ username }) {
    if (!USE_MOCK) return request('/auth/forgot-password', { method: 'POST', body: { username } });
    await delay();
    mockOtp = newCode();
    return ok(
      {
        challengeId: 'rst_' + Date.now(),
        username,
        maskedEmail: 'ad***@example.com',
        resendCooldown: 59,
        devCode: mockOtp,
      },
      'A verification code has been sent.',
    );
  },

  async resendResetCode({ challengeId }) {
    if (!USE_MOCK)
      return request('/auth/forgot-password/resend', { method: 'POST', body: { challengeId } });
    await delay(400);
    mockOtp = newCode();
    return ok({ cooldown: 59, devCode: mockOtp }, 'A new code has been sent.');
  },

  /** Code accepted -> a short-lived token that lets the new password be set. */
  async verifyResetCode({ challengeId, code }) {
    if (!USE_MOCK)
      return request('/auth/forgot-password/verify', {
        method: 'POST',
        body: { challengeId, code },
      });
    await delay();
    if (code !== mockOtp) {
      const e = new Error('That code is incorrect.');
      e.status = 400;
      throw e;
    }
    return ok({ resetToken: 'rst_ok_' + Date.now() }, 'Code accepted. Choose a new password.');
  },

  async resetPassword({ resetToken, password, passwordConfirmation }) {
    if (!USE_MOCK) {
      return request('/auth/forgot-password/reset', {
        method: 'POST',
        body: { resetToken, password, passwordConfirmation },
      });
    }
    await delay();
    return ok(null, 'Your password has been updated. You can now sign in.');
  },

  async me() {
    if (!USE_MOCK) return request('/auth/me');
    await delay(200);
    return ok({
      id: 'US-2001',
      name: 'Ishara Bandara',
      email: 'admin@example.com',
      role: 'Main Admin',
    });
  },
};

// --- Agencies ---------------------------------------------------------------
export const agencyApi = {
  async list({ status = 'all', search = '', type = 'all' } = {}) {
    if (!USE_MOCK) {
      return request(
        '/agencies?status=' + status + '&type=' + type + '&search=' + encodeURIComponent(search),
      );
    }
    await delay(350);
    const term = search.trim().toLowerCase();
    const rows = agencies.filter(
      (a) =>
        (status === 'all' || a.status === status) &&
        (type === 'all' || (a.type || 'local') === type) &&
        (!term ||
          a.name.toLowerCase().includes(term) ||
          a.username.toLowerCase().includes(term) ||
          a.code.toLowerCase().includes(term)),
    );
    return ok(rows);
  },

  async counts({ type = 'all' } = {}) {
    if (!USE_MOCK) return request('/agencies/counts?type=' + type);
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
      type: payload.type || 'local',
      country: payload.type === 'foreign' ? payload.country : 'Sri Lanka',
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
      // Nothing is mailed offline, so the screen asks for the details to be shared by hand.
      credentialsEmail: { to: payload.email, delivered: false },
    });
  },

  async updateStatus(id, status) {
    if (!USE_MOCK)
      return request('/agencies/' + id + '/status', { method: 'PATCH', body: { status } });
    await delay(400);
    agencies = agencies.map((a) => (a.id === id ? { ...a, status } : a));
    return ok(agencies.find((a) => a.id === id));
  },

  /** One agency, with the owner phone and candidate count the list omits. */
  async get(id) {
    if (!USE_MOCK) return request('/agencies/' + id);
    await delay(250);
    const agency = agencies.find((a) => a.id === id);
    return ok({ ...agency, phone: '—', candidates: 0 });
  },

  async remove(id) {
    if (!USE_MOCK) return request('/agencies/' + id, { method: 'DELETE' });
    await delay(400);
    agencies = agencies.filter((a) => a.id !== id);
    return ok({ id });
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
  /** `agencyType` is local, foreign or main (no agency); `agency` one agency's id. */
  async list({ role = 'all', status = 'all', search = '', agencyType = 'all', agency = 'all' } = {}) {
    if (!USE_MOCK)
      return request(
        '/users?role=' + role + '&status=' + status + '&search=' + encodeURIComponent(search) +
          '&agencyType=' + agencyType + '&agency=' + encodeURIComponent(agency),
      );
    await delay(350);
    const term = search.trim().toLowerCase();
    const rows = users.filter(
      (u) =>
        (role === 'all' || u.role === role) &&
        (status === 'all' || u.status === status) &&
        (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
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
    if (!USE_MOCK)
      return request('/users/' + id + '/status', { method: 'PATCH', body: { status } });
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
    const record = {
      id: 'RL-' + (roles.length + 1).toString().padStart(2, '0'),
      slug,
      users: 0,
      system: false,
      ...payload,
    };
    roles = [...roles, record];
    permissions = {
      ...permissions,
      [slug]: Object.fromEntries(
        ['agencies', 'users', 'roles', 'reports', 'billing', 'settings'].map((m) => [
          m,
          { view: false, create: false, edit: false, delete: false },
        ]),
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
    if (!USE_MOCK)
      return request('/roles/' + slug + '/permissions', {
        method: 'PUT',
        body: { permissions: matrix },
      });
    await delay(600);
    permissions = { ...permissions, [slug]: clone(matrix) };
    return ok(permissions[slug], 'Permissions updated.');
  },
};

// --- Job roles --------------------------------------------------------------
/** The trades a candidate is registered for and tested on. Live API only. */
export const jobRoleApi = {
  async list() {
    requireLiveApi();
    return request('/job-roles');
  },

  /** Main Admin and coordinators only. A removed name added again comes back. */
  async create(name) {
    requireLiveApi();
    return request('/job-roles', { method: 'POST', body: { name } });
  },

  /** Takes the trade off the list; candidates and tests that name it keep it. */
  async remove(id) {
    requireLiveApi();
    return request('/job-roles/' + id, { method: 'DELETE' });
  },
};

// --- Foreign companies ------------------------------------------------------
/** The overseas employers a candidate is tested for. A coordinator sees their own. Live API only. */
export const companyApi = {
  async list({ status = 'all' } = {}) {
    requireLiveApi();
    return request('/companies?status=' + status);
  },
};

// --- Skill tests ------------------------------------------------------------
/**
 * One attempt per row, each under its own test number. Booking a new one
 * closes whatever the candidate still had open. Live API only.
 */
export const testApi = {
  async list({ candidateId = '' } = {}) {
    requireLiveApi();
    return request('/tests?candidateId=' + encodeURIComponent(candidateId));
  },

  async book(payload) {
    requireLiveApi();
    return request('/tests', { method: 'POST', body: payload });
  },

  /** result is 'pass' or 'fail'. */
  async result(id, result, note) {
    requireLiveApi();
    return request('/tests/' + id + '/result', { method: 'PATCH', body: { result, note } });
  },
};

// --- Coordinators (Main Admin) ----------------------------------------------
/** People added to help run the system, each opened to the pages they need. Live API only. */
export const coordinatorApi = {
  async list() {
    requireLiveApi();
    return request('/coordinators');
  },

  async create(payload) {
    requireLiveApi();
    return request('/coordinators', { method: 'POST', body: payload });
  },

  async update(id, payload) {
    requireLiveApi();
    return request('/coordinators/' + id, { method: 'PUT', body: payload });
  },

  async setStatus(id, status) {
    requireLiveApi();
    return request('/coordinators/' + id + '/status', { method: 'PATCH', body: { status } });
  },

  async resetPassword(id) {
    requireLiveApi();
    return request('/coordinators/' + id + '/password', { method: 'POST' });
  },

  async remove(id) {
    requireLiveApi();
    return request('/coordinators/' + id, { method: 'DELETE' });
  },
};

// --- Email verification -----------------------------------------------------
export const verificationApi = {
  /**
   * How far each agency's owner login has got - approved, phone verified,
   * email verified, first sign-in - and what is still left.
   */
  async agencies() {
    if (!USE_MOCK) return request('/verification/agencies');
    await delay(300);
    return ok(
      agencies.map((a) => {
        const active = a.status === 'active';
        const at = active ? new Date(a.createdAt).toISOString() : null;
        const pending = active
          ? []
          : [
              ...(a.status === 'pending' ? ['Approve the agency'] : []),
              'Verify the phone number',
              'Verify the email address',
              'Sign in for the first time',
            ];
        return {
          id: a.id,
          name: a.name,
          code: a.code,
          status: a.status,
          createdAt: a.createdAt,
          owner: {
            name: a.contact,
            username: a.username,
            // Kept apart from the confirmation-link rows, which use the agency address.
            email: a.email.replace(/^[^@]+/, 'owner'),
            phone: '0770000000',
          },
          steps: { approved: active, phoneVerifiedAt: at, emailVerifiedAt: at, signedInAt: at },
          state: active ? 'verified' : a.status === 'pending' ? 'awaiting_approval' : 'deactivated',
          pending,
          nextSignInAsks: active ? [] : ['phone', 'email'],
        };
      }),
    );
  },

  async listEmails({ status = 'all', search = '' } = {}) {
    if (!USE_MOCK)
      return request(
        '/verification/emails?status=' + status + '&search=' + encodeURIComponent(search),
      );
    await delay(350);
    const term = search.trim().toLowerCase();
    const rows = emails.filter(
      (e) =>
        (status === 'all' || e.status === status) &&
        (!term || e.email.toLowerCase().includes(term) || e.name.toLowerCase().includes(term)),
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
    return ok(
      emails.find((e) => e.id === id),
      'Email marked as verified.',
    );
  },

  /** Drops the request. The account the link was sent for is untouched. */
  async removeEmail(id) {
    if (!USE_MOCK) return request('/verification/emails/' + id, { method: 'DELETE' });
    await delay(350);
    emails = emails.filter((e) => e.id !== id);
    return ok({ id }, 'Verification request removed.');
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

// --- Notifications ----------------------------------------------------------
export const notificationsApi = {
  /** What the bell lists for whoever is signed in, newest first. */
  async list() {
    // Polled every minute in the background, so it never shows as loading.
    if (!USE_MOCK) return request('/notifications', { background: true });
    await delay(200);
    return ok(
      agencies
        .filter((a) => a.status === 'pending')
        .map((a) => ({
          id: 'agency-pending-' + a.id,
          tone: 'warning',
          title: a.name + ' is awaiting approval',
          body: 'New agency registration. Contact: ' + a.contact + '.',
          at: new Date(a.createdAt).toISOString(),
          link: '/agencies',
        })),
    );
  },
};

// --- Candidates -------------------------------------------------------------
/**
 * Registered by an agency, never signing in themselves.
 *
 * These call the live API only: candidates live in the database, so there is
 * nothing sensible for the offline mock adapter to return.
 */
function requireLiveApi() {
  if (USE_MOCK) {
    const e = new Error('Candidates need the live API. Set VITE_USE_MOCK=false in frontend/.env.');
    e.status = 0;
    throw e;
  }
}

/** Pulls a filename out of a Content-Disposition header. */
function filenameFrom(header, fallback) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header || '');
  return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * Downloads a protected file. The bearer token has to travel in a header, so
 * a plain <a href> cannot be used - the body is fetched and handed to the
 * browser as a blob instead.
 */
async function downloadFile(path, fallbackName) {
  requireLiveApi();

  const done = trackRequest();
  showLoading('Preparing the download...');
  try {
    return await fetchFile(path, fallbackName);
  } finally {
    hideLoading();
    done();
  }
}

async function fetchFile(path, fallbackName) {
  const res = await fetch(BASE_URL + path, {
    headers: { Authorization: 'Bearer ' + tokenStore.get() },
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const error = new Error(payload?.message || 'Download failed (' + res.status + ')');
    error.status = res.status;
    throw error;
  }

  const blob = await res.blob();

  // A proxy or a fatal PHP error can answer 200 with nothing in it, which the
  // browser would happily save as an empty file.
  if (blob.size === 0) {
    throw new Error('The server returned an empty file.');
  }

  const name = filenameFrom(res.headers.get('content-disposition'), fallbackName);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking in the same tick cancels the download in Firefox and Edge, so the
  // URL is released only once the browser has had a turn to read it.
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  return name;
}

export const candidateApi = {
  /** The eight required documents, so the UI never hard-codes the list. */
  async documentTypes() {
    requireLiveApi();
    return request('/candidates/document-types');
  },

  /**
   * An agency login is scoped to itself and ignores agencyId. A cross-agency
   * role has to name one, and gets an empty list until it does.
   */
  async list({ search = '', status = 'all', agencyId = '', poolStatus = 'all' } = {}) {
    requireLiveApi();
    return request(
      '/candidates?search=' +
        encodeURIComponent(search) +
        '&status=' +
        status +
        '&poolStatus=' +
        poolStatus +
        '&agencyId=' +
        encodeURIComponent(agencyId),
    );
  },

  /** Soft delete: the record goes, the uploaded files are kept. */
  async remove(id) {
    requireLiveApi();
    return request('/candidates/' + id, { method: 'DELETE' });
  },

  async get(id) {
    requireLiveApi();
    return request('/candidates/' + id);
  },

  async create(payload) {
    requireLiveApi();
    return request('/candidates', { method: 'POST', body: payload });
  },

  async update(id, payload) {
    requireLiveApi();
    return request('/candidates/' + id, { method: 'PUT', body: payload });
  },

  /** A coordinator's (or the Main Admin's) call: 'submitted' sends the profile on. */
  async updateStatus(id, status) {
    requireLiveApi();
    return request('/candidates/' + id + '/status', { method: 'PATCH', body: { status } });
  },

  /**
   * The agency's own switch. Passing opens the file for documents and stops
   * other agencies registering the person.
   */
  async setPassed(id, passed) {
    requireLiveApi();
    return request('/candidates/' + id + '/pass', { method: 'PATCH', body: { passed } });
  },

  async documents(id) {
    requireLiveApi();
    return request('/candidates/' + id + '/documents');
  },

  /**
   * Where the police report has got to: applied (reference number), or
   * received (reference number and the date it was issued).
   */
  async savePoliceReport(id, { status, referenceNo, issuedDate }) {
    requireLiveApi();
    return request('/candidates/' + id + '/police-report', {
      method: 'PATCH',
      body: { status, referenceNo, issuedDate },
    });
  },

  /** Every version ever uploaded for one document type. */
  async history(id, type) {
    requireLiveApi();
    return request('/candidates/' + id + '/documents/history/' + type);
  },

  /**
   * Attaches another file. Uploads are append-only, so this never replaces
   * what is already there.
   */
  async upload(id, type, file) {
    requireLiveApi();

    const form = new FormData();
    form.append('type', type);
    form.append('file', file);

    const done = trackRequest();
    showLoading('Uploading ' + (file?.name || 'the file') + '...');
    let res;
    try {
      res = await fetch(BASE_URL + '/candidates/' + id + '/documents', {
        method: 'POST',
        // No Content-Type: the browser sets the multipart boundary itself.
        headers: { Authorization: 'Bearer ' + tokenStore.get() },
        body: form,
      });
    } catch {
      const error = new Error(OFFLINE_MESSAGE);
      error.status = 0;
      throw error;
    } finally {
      hideLoading();
      done();
    }

    const payload = await res.json().catch(() => null);

    if (!res.ok || payload?.success === false) {
      const error = new Error(payload?.message || 'Upload failed (' + res.status + ')');
      error.status = res.status;
      error.errors = payload?.errors;
      throw error;
    }

    return payload;
  },

  downloadOne: (candidateId, documentId, name) =>
    downloadFile('/candidates/' + candidateId + '/documents/' + documentId + '/download', name),

  /** All types zipped, one folder each holding the latest file. */
  downloadAll: (candidateId, candidateName) =>
    downloadFile(
      '/candidates/' + candidateId + '/documents/download-all',
      (candidateName || 'candidate') + '-documents.zip',
    ),
};

// --- The signed-in agency's own details -------------------------------------
/**
 * Name, contact and address save straight away. The phone and email are where
 * sign-in codes go, so a new one is saved only once the code sent to it is
 * entered. Live API only, like candidates.
 */
export const agencyProfileApi = {
  async get() {
    requireLiveApi();
    return request('/agency-profile');
  },

  async update(payload) {
    requireLiveApi();
    return request('/agency-profile', { method: 'PUT', body: payload });
  },

  /**
   * The signature or the seal, as a picture. Uploading one replaces what was
   * there: a seal is simply the current seal, with no history to keep.
   */
  async uploadMark(type, file) {
    requireLiveApi();

    const form = new FormData();
    form.append('type', type);
    form.append('file', file);

    const done = trackRequest();
    showLoading('Uploading the ' + type + '...');
    let res;
    try {
      res = await fetch(BASE_URL + '/agency-profile/marks', {
        method: 'POST',
        // No Content-Type: the browser sets the multipart boundary itself.
        headers: { Authorization: 'Bearer ' + tokenStore.get() },
        body: form,
      });
    } catch {
      const error = new Error(OFFLINE_MESSAGE);
      error.status = 0;
      throw error;
    } finally {
      hideLoading();
      done();
    }

    const payload = await res.json().catch(() => null);

    if (!res.ok || payload?.success === false) {
      const error = new Error(payload?.message || 'Upload failed (' + res.status + ')');
      error.status = res.status;
      error.errors = payload?.errors;
      throw error;
    }

    return payload;
  },

  /**
   * The picture itself, as a blob URL the page can show. The file sits on a
   * private disk, so it is fetched with the token rather than linked to.
   * Whoever calls this revokes the URL when the page is done with it.
   */
  async markUrl(type) {
    requireLiveApi();

    const res = await fetch(BASE_URL + '/agency-profile/marks/' + type, {
      headers: { Authorization: 'Bearer ' + tokenStore.get() },
    });
    if (!res.ok) return null;

    return URL.createObjectURL(await res.blob());
  },

  async removeMark(type) {
    requireLiveApi();
    return request('/agency-profile/marks/' + type, { method: 'DELETE' });
  },

  /** Sends a code to the new value; nothing changes until it is entered. */
  async requestContactChange(field, value) {
    requireLiveApi();
    return request('/agency-profile/contact', { method: 'POST', body: { field, value } });
  },

  async resendContactCode(challengeId) {
    requireLiveApi();
    return request('/agency-profile/contact/resend', { method: 'POST', body: { challengeId } });
  },

  async verifyContactChange(challengeId, code) {
    requireLiveApi();
    return request('/agency-profile/contact/verify', {
      method: 'POST',
      body: { challengeId, code },
    });
  },
};

/**
 * A multipart upload with the loading dialog up until the server answers.
 * Unwrapped like request(): the payload, or an Error carrying the field errors.
 */
async function uploadForm(path, form, label) {
  const done = trackRequest();
  showLoading(label);
  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method: 'POST',
      // No Content-Type: the browser sets the multipart boundary itself.
      headers: { Authorization: 'Bearer ' + tokenStore.get() },
      body: form,
    });
  } catch {
    const error = new Error(OFFLINE_MESSAGE);
    error.status = 0;
    throw error;
  } finally {
    hideLoading();
    done();
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    const error = new Error(payload?.message || 'Upload failed (' + res.status + ')');
    error.status = res.status;
    error.errors = payload?.errors;
    throw error;
  }
  return payload;
}

// --- Agreements (Main Admin) -------------------------------------------------
/**
 * The uploaded agreement PDFs, and the copies filled from them in English,
 * Hebrew and Sinhala. Live API only.
 */
export const agreementApi = {
  async templates() {
    requireLiveApi();
    return request('/agreement-templates');
  },

  /** With saved, the PDF is only kept for starting agreements from later. */
  async uploadTemplate({ name, layout, file, saved = false }) {
    requireLiveApi();

    const form = new FormData();
    form.append('name', name);
    form.append('layout', layout);
    form.append('file', file);
    if (saved) form.append('saved', '1');

    return uploadForm('/agreement-templates', form, 'Uploading ' + (file?.name || 'the agreement') + '...');
  },

  /** The company seal or the signature (type 'seal' | 'signature'), printed on every page. */
  async uploadMark(id, type, file) {
    requireLiveApi();

    const form = new FormData();
    form.append('type', type);
    form.append('file', file);

    return uploadForm('/agreements/' + id + '/marks', form, 'Uploading the ' + type + '...');
  },

  /** The seal or the signature as a picture, for the filled PDF. */
  async markBlob(id, type) {
    requireLiveApi();
    const res = await fetch(BASE_URL + '/agreements/' + id + '/marks/' + type, {
      headers: { Authorization: 'Bearer ' + tokenStore.get() },
    });
    if (!res.ok) throw new Error('Could not load the ' + type + '.');
    return res.blob();
  },

  /**
   * The original PDF as a blob URL, to open in a new tab. It sits on a
   * private disk, so it is fetched with the token rather than linked to.
   */
  async templateFileUrl(id) {
    requireLiveApi();
    const res = await fetch(BASE_URL + '/agreement-templates/' + id + '/file', {
      headers: { Authorization: 'Bearer ' + tokenStore.get() },
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || 'Could not open the PDF.');
    }
    return URL.createObjectURL(await res.blob());
  },

  /** The admin side's blank agreements, which a foreign company downloads. */
  async blankTemplates() {
    requireLiveApi();
    return request('/agreement-templates/blank');
  },

  /** One blank agreement's PDF, as a blob. */
  async blankTemplateBlob(id) {
    requireLiveApi();
    const res = await fetch(BASE_URL + '/agreement-templates/blank/' + id + '/file', {
      headers: { Authorization: 'Bearer ' + tokenStore.get() },
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || 'Could not download the PDF.');
    }
    return res.blob();
  },

  async removeTemplate(id) {
    requireLiveApi();
    return request('/agreement-templates/' + id, { method: 'DELETE' });
  },

  /**
   * A company's own, or those passed to a local agency. On the admin side:
   * its own, or - given `company` ("all" or an id), `status` or
   * `localAgency` - what foreign companies have sent it.
   */
  async list({ company, status, localAgency } = {}) {
    requireLiveApi();
    const query = new URLSearchParams(
      Object.entries({ company, status, localAgency }).filter(([, value]) => value)
    ).toString();
    return request('/agreements' + (query ? '?' + query : ''));
  },

  /** The foreign companies that have sent agreements, and the local agencies to pass them to. */
  async recipients() {
    requireLiveApi();
    return request('/agreements/recipients');
  },

  /** The original PDF behind an agreement, for any side that may read it, as bytes. */
  async fileBytes(id) {
    requireLiveApi();
    const res = await fetch(BASE_URL + '/agreements/' + id + '/file', {
      headers: { Authorization: 'Bearer ' + tokenStore.get() },
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || 'Could not open the PDF.');
    }
    return res.arrayBuffer();
  },

  /** What the company keeps up to date at any stage: { title?, salary? }. */
  async updateDetails(id, details) {
    requireLiveApi();
    return request('/agreements/' + id + '/details', { method: 'PATCH', body: details });
  },

  /** The monthly salary in NIS, in place of the amount clause 3a prints. */
  async setSalary(id, salary) {
    requireLiveApi();
    return request('/agreements/' + id + '/salary', { method: 'PUT', body: { salary } });
  },

  /** A foreign company hands its checked agreement to the admin side. */
  async sendToAdmin(id) {
    requireLiveApi();
    return request('/agreements/' + id + '/send-to-admin', { method: 'POST' });
  },

  /** The local agency's candidates for an agreement it was sent: passed ones first. */
  async candidates(id) {
    requireLiveApi();
    return request('/agreements/' + id + '/candidates');
  },

  /** The local agency puts a candidate on the agreement, filling its employee part. */
  async assign(id, candidateId) {
    requireLiveApi();
    return request('/agreements/' + id + '/assign', { method: 'POST', body: { candidateId } });
  },

  /** The admin side passes a company's agreement to one local agency. */
  async sendToAgency(id, agencyId) {
    requireLiveApi();
    return request('/agreements/' + id + '/send-to-agency', { method: 'POST', body: { agencyId } });
  },

  async create(templateId, title) {
    requireLiveApi();
    return request('/agreements', { method: 'POST', body: { templateId, title } });
  },

  async get(id) {
    requireLiveApi();
    return request('/agreements/' + id);
  },

  async update(id, payload) {
    requireLiveApi();
    return request('/agreements/' + id, { method: 'PUT', body: payload });
  },

  /** Hebrew and Sinhala for employer fields from their new English: { field: english }. */
  async localiseEmployer(english) {
    requireLiveApi();
    return request('/agreements/employer-localise', { method: 'POST', body: { english } });
  },

  async remove(id) {
    requireLiveApi();
    return request('/agreements/' + id, { method: 'DELETE' });
  },

  /**
   * Hebrew and Sinhala for each English text, in the same order. A read,
   * as far as the screen is concerned, so it only moves the top bar.
   */
  async translate(texts) {
    requireLiveApi();
    return request('/agreements/translate', { method: 'POST', body: { texts }, background: true });
  },
};

// --- Employer agreement (foreign company) -------------------------------------
/**
 * The employer part of the agreement, submitted by a foreign company from its
 * own login. The English comes from the company record on the server; only
 * the Hebrew and Sinhala of the translated fields are sent. Live API only.
 */
export const employerAgreementApi = {
  async draft() {
    requireLiveApi();
    return request('/employer-agreement/draft');
  },

  async submit(values) {
    requireLiveApi();
    return request('/employer-agreement', { method: 'POST', body: { values } });
  },

  /** A company's own submissions; for the Main Admin and coordinators, every one. */
  async list() {
    requireLiveApi();
    return request('/employer-agreements');
  },
};
