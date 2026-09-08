/**
 * Checks the SMTP settings in .env and sends one test message.
 *
 *   node scripts/test-email.js                 -> sends to SMTP_USER
 *   node scripts/test-email.js you@example.com -> sends to that address
 */
require('dotenv').config();
const emailService = require('../src/services/email.service');

(async () => {
  const to = process.argv[2] || process.env.SMTP_USER;

  if (!emailService.isConfigured()) {
    console.error('\n  SMTP is not configured.');
    console.error('  Set SMTP_USER and SMTP_PASS in backend/.env, then run this again.');
    console.error('  SMTP_PASS must be a Google App Password (16 characters).\n');
    process.exit(1);
  }

  console.log('\n  Host : ' + (process.env.SMTP_HOST || 'smtp.gmail.com') + ':' + (process.env.SMTP_PORT || 587));
  console.log('  User : ' + process.env.SMTP_USER);
  console.log('  To   : ' + to + '\n');

  process.stdout.write('  Verifying credentials... ');
  const check = await emailService.verifyConnection();
  if (!check.ok) {
    console.log('FAILED');
    console.error('\n  ' + check.reason + '\n');
    if (/username and password not accepted|invalid login|535/i.test(check.reason)) {
      console.error('  That usually means the password is not an App Password,');
      console.error('  or 2-Step Verification is not enabled on the account.\n');
    }
    process.exit(1);
  }
  console.log('OK');

  process.stdout.write('  Sending test code...     ');
  const result = await emailService.sendOtp(to, '123456');
  console.log(result.delivered ? 'SENT' : 'NOT SENT');
  console.log('\n  Check the inbox for ' + to + ' (look in Spam too).\n');
})().catch((err) => {
  console.error('\n  Failed: ' + err.message + '\n');
  process.exit(1);
});
