/**
 * review-token.js — HMAC-signed, expiring review invite tokens
 *
 * Format: v1.<id>.<exp>.<sig>
 *   id  = 16 random bytes, base64url (22 chars)
 *   exp = unix seconds
 *   sig = base64url(HMAC-SHA256(secret, "v1.<id>.<exp>"))
 *
 * Stateless: the signature proves we issued it. One-time use is enforced
 * by testimonials.js (inviteId recorded in testimonials.json).
 */

const crypto = require('crypto');

const VERSION        = 'v1';
const MIN_SECRET_LEN = 32;
const ID_RE          = /^[A-Za-z0-9_-]{22}$/;
const EXP_RE         = /^\d{1,12}$/;
const SIG_RE         = /^[A-Za-z0-9_-]{43}$/;

function sign(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function createInviteToken(secret, days) {
  if (!secret || secret.length < MIN_SECRET_LEN) {
    throw new Error(`REVIEW_INVITE_SECRET must be at least ${MIN_SECRET_LEN} characters`);
  }
  const id   = crypto.randomBytes(16).toString('base64url');
  const exp  = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  const data = `${VERSION}.${id}.${exp}`;
  return { token: `${data}.${sign(secret, data)}`, id, exp };
}

// Returns { ok: true, id, exp } or { ok: false, reason: 'invalid'|'expired'|'server_not_configured' }
function verifyInviteToken(secret, token) {
  if (!secret || secret.length < MIN_SECRET_LEN) return { ok: false, reason: 'server_not_configured' };
  if (typeof token !== 'string' || token.length > 200) return { ok: false, reason: 'invalid' };

  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'invalid' };
  const [version, id, expStr, sig] = parts;
  if (version !== VERSION || !ID_RE.test(id) || !EXP_RE.test(expStr) || !SIG_RE.test(sig)) {
    return { ok: false, reason: 'invalid' };
  }

  const expected = Buffer.from(sign(secret, `${version}.${id}.${expStr}`));
  const given    = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  const exp = Number(expStr);
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };

  return { ok: true, id, exp };
}

module.exports = { createInviteToken, verifyInviteToken };
