const crypto = require('crypto');

const TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 300);
const RESEND_COOLDOWN = Number(process.env.OTP_RESEND_COOLDOWN || 59);

// In-memory challenge store. Swap for Redis in production so the cooldown
// survives a restart and works across instances.
const challenges = new Map();

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/**
 * Creates a verification challenge for one channel.
 *
 * @param {string} adminId
 * @param {string} destination  phone number or email address
 * @param {'sms'|'email'} channel
 * @param {object} meta         carried through to the next step (e.g. { phoneVerified: true })
 */
function createChallenge(adminId, destination, channel = 'sms', meta = {}) {
  const id = 'chg_' + crypto.randomBytes(12).toString('hex');
  const code = generateCode();
  const now = Date.now();

  challenges.set(id, {
    id,
    adminId,
    destination,
    channel,
    meta,
    code,
    expiresAt: now + TTL_SECONDS * 1000,
    lastSentAt: now,
    attempts: 0,
  });

  return { id, code, channel, expiresAt: now + TTL_SECONDS * 1000 };
}

const getChallenge = (id) => challenges.get(id);

/** Returns { ok, challenge } or { ok: false, reason }. */
function verifyChallenge(id, code, expectedChannel) {
  const challenge = challenges.get(id);
  if (!challenge) return { ok: false, reason: 'This verification session has expired.' };

  if (expectedChannel && challenge.channel !== expectedChannel) {
    return { ok: false, reason: 'Wrong verification step for this session.' };
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(id);
    return { ok: false, reason: 'The code has expired. Request a new one.' };
  }

  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    challenges.delete(id);
    return { ok: false, reason: 'Too many attempts. Please sign in again.' };
  }
  if (challenge.code !== code) return { ok: false, reason: 'That code is incorrect.' };

  challenges.delete(id);
  return { ok: true, challenge };
}

/** Enforces the same 59-second cooldown the UI counts down. */
function rotateCode(id) {
  const challenge = challenges.get(id);
  if (!challenge) return { ok: false, reason: 'This verification session has expired.' };

  const elapsed = (Date.now() - challenge.lastSentAt) / 1000;
  if (elapsed < RESEND_COOLDOWN) {
    return {
      ok: false,
      reason: 'Please wait before requesting another code.',
      retryAfter: Math.ceil(RESEND_COOLDOWN - elapsed),
    };
  }

  challenge.code = generateCode();
  challenge.lastSentAt = Date.now();
  challenge.expiresAt = Date.now() + TTL_SECONDS * 1000;
  challenge.attempts = 0;

  return { ok: true, code: challenge.code, channel: challenge.channel, cooldown: RESEND_COOLDOWN };
}

/** Masks a phone for display: 0781311850 -> "078 XXX 1850". */
function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 6) return '****';
  return digits.slice(0, 3) + ' ' + 'X'.repeat(Math.max(digits.length - 7, 3)) + ' ' + digits.slice(-4);
}

/**
 * Masks an email for display, e.g. visaltheekshana555@gmail.com ->
 * "vi******@gmail.com". The run of asterisks is capped at 6 so a long local
 * part does not stretch the layout or leak its length.
 */
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '****';
  const head = local.slice(0, Math.min(2, local.length));
  const hidden = Math.min(Math.max(local.length - head.length, 3), 6);
  return head + '*'.repeat(hidden) + '@' + domain;
}

module.exports = {
  createChallenge,
  getChallenge,
  verifyChallenge,
  rotateCode,
  maskPhone,
  maskEmail,
  RESEND_COOLDOWN,
};
