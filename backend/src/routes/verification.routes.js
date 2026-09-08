const router = require('express').Router();
const { body } = require('express-validator');

const verificationController = require('../controllers/verification.controller');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/requireAuth');

/** Public: the link in the confirmation email lands here. */
router.get('/emails/confirm/:token', verificationController.confirmByToken);

router.use(requireAuth);

/** GET /api/v1/verification/emails?status=&search= */
router.get('/emails', verificationController.listEmails);

/** POST /api/v1/verification/emails - queue a new confirmation email */
router.post(
  '/emails',
  [body('email').isEmail().withMessage('A valid email is required.')],
  validate,
  verificationController.requestEmail
);

/** POST /api/v1/verification/emails/:id/resend */
router.post('/emails/:id/resend', verificationController.resendEmail);

/** PATCH /api/v1/verification/emails/:id/verify - manual override by the admin */
router.patch('/emails/:id/verify', verificationController.markVerified);

module.exports = router;
