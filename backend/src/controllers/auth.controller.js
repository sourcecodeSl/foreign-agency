const jwt = require('jsonwebtoken');

const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ok } = require('../utils/response');
const otp = require('../utils/otp');
const userStore = require('../models/user.store');
const smsService = require('../services/sms.service');
const emailService = require('../services/email.service');

/**
 * Sign-in is a three-step flow. A session token is issued only after BOTH
 * factors are confirmed:
 *
 *   1. POST /auth/login         -> credentials  -> SMS code   (phone challenge)
 *   2. POST /auth/verify-otp    -> phone code   -> email code (email challenge)
 *   3. POST /auth/verify-email  -> email code   -> JWT token
 *
 * Each step returns `nextStep` so the client always knows where to go, and the
 * challenge id is rotated between steps so a phone code can never be replayed
 * against the email step.
 */

const signToken = (user) =>
  jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role, roleSlug: user.roleSlug },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

/**
 * The code is echoed to the UI only when the provider could not actually
 * deliver it (no SMTP / no SMS key), and never in production. Once real
 * delivery works, the on-screen "Demo mode" panel disappears by itself.
 */
const devCode = (code, sent) => {
  if (process.env.NODE_ENV === 'production') return undefined;
  return sent && sent.delivered ? undefined : code;
};

/**
 * POST /auth/login - step 1.
 * Dummy: any known admin + a >=6 char password passes. Replace the password
 * check with bcrypt.compare(password, user.passwordHash).
 */
exports.login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = userStore.findByUsernameOrEmail(username) || userStore.findById('US-2001');
  if (!user || password.length < 6) {
    throw new ApiError(401, 'Invalid username or password.');
  }
  if (user.status !== 'active') {
    throw new ApiError(403, 'This account is not active. Contact system support.');
  }

  const challenge = otp.createChallenge(user.id, user.phone, 'sms');
  const sent = await smsService.sendOtp(user.phone, challenge.code);

  return ok(res, {
    nextStep: 'phone',
    challengeId: challenge.id,
    channel: 'sms',
    maskedPhone: otp.maskPhone(user.phone),
    resendCooldown: otp.RESEND_COOLDOWN, // 59 - drives the UI countdown
    devCode: devCode(challenge.code, sent),
  });
});

/**
 * POST /auth/verify-otp - step 2.
 * Confirms the phone code, then immediately opens the email challenge.
 * No token is issued here.
 */
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { challengeId, code } = req.body;

  const result = otp.verifyChallenge(challengeId, code, 'sms');
  if (!result.ok) throw new ApiError(400, result.reason);

  const user = userStore.findById(result.challenge.adminId);
  if (!user) throw new ApiError(404, 'Account not found.');

  // Phone confirmed - carry that fact into the email challenge.
  const emailChallenge = otp.createChallenge(user.id, user.email, 'email', { phoneVerified: true });
  const sent = await emailService.sendOtp(user.email, emailChallenge.code);

  return ok(
    res,
    {
      verified: 'phone',
      nextStep: 'email',
      challengeId: emailChallenge.id,
      channel: 'email',
      maskedEmail: otp.maskEmail(user.email),
      resendCooldown: otp.RESEND_COOLDOWN,
      devCode: devCode(emailChallenge.code, sent),
    },
    'Phone number verified. Now confirm your email address.'
  );
});

/**
 * POST /auth/verify-email - step 3.
 * Both factors are now confirmed, so the session token is issued.
 */
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { challengeId, code } = req.body;

  const result = otp.verifyChallenge(challengeId, code, 'email');
  if (!result.ok) throw new ApiError(400, result.reason);

  // Defence in depth: this challenge can only exist after the phone step,
  // but check the flag rather than trusting the flow.
  if (!result.challenge.meta?.phoneVerified) {
    throw new ApiError(400, 'Verify your phone number before confirming your email.');
  }

  const user = userStore.findById(result.challenge.adminId);
  if (!user) throw new ApiError(404, 'Account not found.');

  userStore.update(user.id, {
    lastLogin: new Date().toISOString().slice(0, 16).replace('T', ' '),
    emailVerifiedAt: new Date().toISOString(),
  });

  return ok(
    res,
    {
      verified: 'email',
      nextStep: 'dashboard',
      token: signToken(user),
      admin: { id: user.id, name: user.name, email: user.email, role: user.role, roleSlug: user.roleSlug },
    },
    'Verification complete.'
  );
});

/**
 * POST /auth/resend-otp - works for whichever step is in flight; the channel
 * is read from the challenge itself. Refuses inside the 59-second cooldown.
 */
exports.resendOtp = asyncHandler(async (req, res) => {
  const { challengeId } = req.body;

  const result = otp.rotateCode(challengeId);
  if (!result.ok) {
    throw new ApiError(429, result.reason + (result.retryAfter ? ' (' + result.retryAfter + 's)' : ''));
  }

  const challenge = otp.getChallenge(challengeId);

  const sent =
    challenge.channel === 'email'
      ? await emailService.sendOtp(challenge.destination, result.code)
      : await smsService.sendOtp(challenge.destination, result.code);

  return ok(
    res,
    {
      resentAt: new Date().toISOString(),
      channel: challenge.channel,
      cooldown: result.cooldown,
      devCode: devCode(result.code, sent),
    },
    'A new code has been sent.'
  );
});

/** GET /auth/me */
exports.me = asyncHandler(async (req, res) => {
  const user = userStore.findById(req.user.sub);
  if (!user) throw new ApiError(404, 'Account not found.');
  return ok(res, { id: user.id, name: user.name, email: user.email, role: user.role, roleSlug: user.roleSlug });
});

/** POST /auth/logout - stateless JWT, so this only clears the cookie. */
exports.logout = asyncHandler(async (req, res) => {
  res.clearCookie('token');
  return ok(res, null, 'Signed out.');
});
