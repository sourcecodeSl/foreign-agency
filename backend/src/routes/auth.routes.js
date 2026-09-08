const router = require('express').Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/requireAuth');

// Brute-force protection on the two credential-facing endpoints.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 12 });

/**
 * POST /api/v1/auth/register
 * Creates a new account. Password rules are enforced here and mirrored in the
 * React form so the user sees the same messages before submitting.
 */
router.post(
  '/register',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }),
  [
    body('name').trim().isLength({ min: 3, max: 120 }).withMessage('Name must be at least 3 characters.'),
    // Deliberately not normalizeEmail(): its Gmail rules strip dots, so
    // "a.b@gmail.com" would be stored as "ab@gmail.com" and then fail to match
    // at login. The model lowercases, which is all the normalising we want.
    body('email').trim().isEmail().withMessage('Enter a valid email address.'),
    body('phone')
      .trim()
      .matches(/^[0-9+\s-]{9,20}$/)
      .withMessage('Enter a valid phone number.'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/[A-Z]/)
      .withMessage('Password must include an uppercase letter.')
      .matches(/[0-9]/)
      .withMessage('Password must include a number.'),
    body('confirmPassword')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match.'),
  ],
  validate,
  authController.register
);

/**
 * POST /api/v1/auth/login
 * Step 1 of sign-in: validates credentials and issues an OTP challenge.
 */
router.post(
  '/login',
  loginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  ],
  validate,
  authController.login
);

/**
 * POST /api/v1/auth/verify-otp
 * Step 2: exchanges a valid OTP for a JWT session token.
 */
router.post(
  '/verify-otp',
  otpLimiter,
  [
    body('challengeId').notEmpty().withMessage('Challenge id is required.'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.'),
  ],
  validate,
  authController.verifyOtp
);

/**
 * POST /api/v1/auth/verify-email
 * Step 3: confirms the emailed code and issues the session token. This is the
 * only endpoint that hands out a JWT.
 */
router.post(
  '/verify-email',
  otpLimiter,
  [
    body('challengeId').notEmpty().withMessage('Challenge id is required.'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.'),
  ],
  validate,
  authController.verifyEmail
);

/**
 * POST /api/v1/auth/resend-otp
 * Works for both the phone and email steps; honours a 59-second cooldown
 * (mirrors the countdown shown in the UI).
 */
router.post(
  '/resend-otp',
  otpLimiter,
  [body('challengeId').notEmpty().withMessage('Challenge id is required.')],
  validate,
  authController.resendOtp
);

/** GET /api/v1/auth/me - current admin profile, used to restore a session. */
router.get('/me', requireAuth, authController.me);

/** POST /api/v1/auth/logout */
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
