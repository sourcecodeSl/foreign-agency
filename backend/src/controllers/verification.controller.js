const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ok, created } = require('../utils/response');
const verificationStore = require('../models/verification.store');
const emailService = require('../services/email.service');

/** GET /verification/emails?status=&search= */
exports.listEmails = asyncHandler(async (req, res) => {
  const { status = 'all', search = '' } = req.query;
  return ok(res, verificationStore.findAll({ status, search }));
});

/** POST /verification/emails - queue a confirmation email. */
exports.requestEmail = asyncHandler(async (req, res) => {
  const { email, name, agency } = req.body;
  const token = verificationStore.newToken();

  const record = verificationStore.insert({
    email,
    name: name || '-',
    agency: agency || '-',
    requestedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    token,
  });

  await emailService.sendVerification(email, token);
  return created(res, record, 'Verification email sent.');
});

/** POST /verification/emails/:id/resend */
exports.resendEmail = asyncHandler(async (req, res) => {
  const record = verificationStore.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Verification request not found.');
  if (record.status === 'verified') throw new ApiError(400, 'This email is already verified.');

  const token = verificationStore.newToken();
  const updated = verificationStore.update(record.id, {
    token,
    attempts: record.attempts + 1,
    status: 'unverified',
    requestedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  });

  await emailService.sendVerification(record.email, token);
  return ok(res, updated, 'Verification email resent to ' + record.email + '.');
});

/** PATCH /verification/emails/:id/verify - manual override by the admin. */
exports.markVerified = asyncHandler(async (req, res) => {
  const updated = verificationStore.update(req.params.id, {
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    verifiedBy: req.user.sub,
  });
  if (!updated) throw new ApiError(404, 'Verification request not found.');
  return ok(res, updated, updated.email + ' marked as verified.');
});

/** GET /verification/emails/confirm/:token - public link from the email. */
exports.confirmByToken = asyncHandler(async (req, res) => {
  const record = verificationStore.findByToken(req.params.token);
  if (!record) throw new ApiError(400, 'This confirmation link is invalid or has expired.');

  const updated = verificationStore.update(record.id, {
    status: 'verified',
    verifiedAt: new Date().toISOString(),
  });
  return ok(res, updated, 'Email confirmed. You can now sign in.');
});
