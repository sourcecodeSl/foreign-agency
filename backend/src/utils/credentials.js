const crypto = require('crypto');

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SYMBOL = '!@#$%*?';

const pick = (chars) => chars[crypto.randomInt(0, chars.length)];

/**
 * Cryptographically random password that always satisfies the create-agency
 * rules (>= 8 chars, one uppercase, one digit).
 */
function generatePassword(length = 12) {
  const all = UPPER + LOWER + DIGIT + SYMBOL;
  const out = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (out.length < length) out.push(pick(all));

  // Fisher-Yates so the guaranteed characters are not always in front.
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

/** Short human-readable agency code, e.g. "SKY-1042". */
function generateAgencyCode(name, sequence) {
  const prefix = name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  return prefix + '-' + sequence;
}

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

module.exports = { generatePassword, generateAgencyCode, slugify };
