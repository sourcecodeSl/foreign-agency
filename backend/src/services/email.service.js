const nodemailer = require('nodemailer');

/**
 * Transactional email.
 *
 * When SMTP credentials are present the mail is really sent; otherwise the
 * message is logged to the console so local development still works. Every
 * send returns `{ delivered }` - the auth controller uses that to decide
 * whether the OTP still needs to be shown on screen.
 */

const confirmUrl = (token) =>
  (process.env.API_URL || 'http://localhost:5000') + '/api/v1/verification/emails/confirm/' + token;

/** SMTP is considered configured once a user and password are both present. */
function isConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    // Port 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

const fromAddress = () =>
  process.env.SMTP_FROM || '"Agency Admin" <' + (process.env.SMTP_USER || 'no-reply@localhost') + '>';

/** Checks the SMTP credentials without sending anything. */
async function verifyConnection() {
  if (!isConfigured()) return { ok: false, reason: 'SMTP_USER / SMTP_PASS are not set.' };
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Sends a message, or logs it when SMTP is not configured.
 * Throws in production rather than silently not delivering.
 */
async function deliver({ to, subject, text, html, logLine }) {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email provider is not configured (set SMTP_USER and SMTP_PASS).');
    }
    console.log(logLine);
    return { delivered: false, to };
  }

  const info = await getTransporter().sendMail({ from: fromAddress(), to, subject, text, html });
  console.log('[mail] sent to ' + to + ' (' + info.messageId + ')');
  return { delivered: true, to, messageId: info.messageId };
}

const OTP_TTL_MINUTES = Math.round(Number(process.env.OTP_TTL_SECONDS || 300) / 60);

/** Shared shell so every message looks the same in the inbox. */
const layout = (heading, bodyHtml) =>
  '<div style="margin:0;padding:24px;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
  '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">' +
  '<div style="padding:20px 28px;background:#1d41f5;color:#ffffff">' +
  '<span style="font-size:16px;font-weight:700;letter-spacing:.2px">Agency Admin</span>' +
  '<span style="font-size:12px;opacity:.85;display:block;margin-top:2px">Main Admin System</span>' +
  '</div>' +
  '<div style="padding:28px">' +
  '<h1 style="margin:0 0 12px;font-size:18px;color:#111827">' + heading + '</h1>' +
  bodyHtml +
  '</div>' +
  '<div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">' +
  'If you did not request this, you can safely ignore this email.' +
  '</div></div></div>';

/**
 * Second-factor code sent by email. Step 2 of sign-in uses this after the
 * phone number has been confirmed.
 */
exports.sendOtp = async function sendOtp(email, code) {
  const html = layout(
    'Your verification code',
    '<p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">' +
      'Enter this code to finish signing in. It expires in ' + OTP_TTL_MINUTES + ' minutes.</p>' +
      '<div style="text-align:center;margin:0 0 20px">' +
      '<span style="display:inline-block;padding:14px 28px;background:#eef4ff;border:1px solid #bcd3ff;' +
      'border-radius:10px;font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:700;' +
      'letter-spacing:10px;color:#162fe1">' + code + '</span></div>' +
      '<p style="margin:0;color:#6b7280;font-size:13px">Never share this code with anyone.</p>'
  );

  return deliver({
    to: email,
    subject: code + ' is your Agency Admin verification code',
    text: 'Your Agency Admin verification code is ' + code + '. It expires in ' + OTP_TTL_MINUTES + ' minutes.',
    html,
    logLine: '[mail] OTP for ' + email + ': ' + code,
  });
};

/** Confirmation link used by the Email Verification module. */
exports.sendVerification = async function sendVerification(email, token) {
  const link = confirmUrl(token);
  const html = layout(
    'Confirm your email address',
    '<p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6">' +
      'Click the button below to confirm this address.</p>' +
      '<div style="text-align:center;margin:0 0 20px">' +
      '<a href="' + link + '" style="display:inline-block;padding:12px 24px;background:#1d41f5;' +
      'color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">' +
      'Confirm email</a></div>' +
      '<p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all">' + link + '</p>'
  );

  return deliver({
    to: email,
    subject: 'Confirm your email address',
    text: 'Confirm your email address: ' + link,
    html,
    logLine: '[mail] Verification link for ' + email + ': ' + link,
  });
};

/** Hands newly created agency credentials to the agency owner. */
exports.sendAgencyCredentials = async function sendAgencyCredentials(email, { username, password, loginUrl }) {
  const row = (label, value) =>
    '<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">' + label + '</td>' +
    '<td style="padding:8px 0;text-align:right;font-family:Consolas,Menlo,monospace;font-size:13px;color:#111827">' +
    value + '</td></tr>';

  const html = layout(
    'Your agency account is ready',
    '<table style="width:100%;border-collapse:collapse;margin:0 0 20px">' +
      row('Username', username) + row('Password', password) +
      '</table>' +
      '<div style="text-align:center;margin:0 0 20px">' +
      '<a href="' + loginUrl + '" style="display:inline-block;padding:12px 24px;background:#1d41f5;' +
      'color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Sign in</a></div>' +
      '<p style="margin:0;color:#6b7280;font-size:13px">Please change this password after your first sign-in.</p>'
  );

  return deliver({
    to: email,
    subject: 'Your Agency Admin credentials',
    text: 'Username: ' + username + '\nPassword: ' + password + '\nSign in: ' + loginUrl,
    html,
    logLine: '[mail] Credentials for ' + email + ' -> ' + username + ' / ' + password + ' @ ' + loginUrl,
  });
};

exports.isConfigured = isConfigured;
exports.verifyConnection = verifyConnection;
