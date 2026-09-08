/**
 * OTP delivery over SMS.
 *
 * No provider is wired up yet, so this logs the code and reports
 * `delivered: false` - which is what makes the UI keep showing the code on
 * screen. Plug in Twilio / Dialog / Notify.lk below and return
 * `delivered: true`; the on-screen code then disappears on its own.
 */
const DEFAULT_COUNTRY_CODE = process.env.SMS_COUNTRY_CODE || '94';

/**
 * Normalises a local Sri Lankan number to E.164, which is what every SMS
 * gateway expects: 0781311850 -> +94781311850. Numbers already in
 * international form are returned untouched.
 */
function toE164(phone) {
  const digits = String(phone).replace(/\D/g, '');

  if (String(phone).trim().startsWith('+')) return '+' + digits;
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return '+' + digits;
  if (digits.startsWith('0')) return '+' + DEFAULT_COUNTRY_CODE + digits.slice(1);

  return '+' + DEFAULT_COUNTRY_CODE + digits;
}

const isConfigured = () => Boolean(process.env.SMS_PROVIDER_KEY);

exports.toE164 = toE164;
exports.isConfigured = isConfigured;

exports.sendOtp = async function sendOtp(phone, code) {
  const to = toE164(phone);

  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMS provider is not configured.');
    }
    console.log('[sms] OTP for ' + to + ': ' + code);
    return { delivered: false, to };
  }

  // await twilio.messages.create({ to, from: process.env.SMS_FROM,
  //   body: `Your Agency Admin verification code is ${code}. It expires in 5 minutes.` });
  throw new Error('SMS provider key is set but no provider client is wired up yet.');
};
