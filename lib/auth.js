// Manuscript Mentors — authentication helpers.
//
// Passwords are hashed with scrypt (built-in, no dependencies). Sessions are
// stateless: a signed, expiring HMAC token stored in an HttpOnly cookie, so the
// same code works on a long-lived server or on stateless serverless functions.

import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'manuscript-mentors-dev-secret-change-me';
export const USING_DEFAULT_SECRET = !process.env.SESSION_SECRET;

const COOKIE_NAME = 'mm_session';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---- Passwords ----
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
export function verifyPassword(password, salt, hash) {
  try {
    const test = crypto.scryptSync(String(password), salt, 64);
    const known = Buffer.from(hash, 'hex');
    return test.length === known.length && crypto.timingSafeEqual(test, known);
  } catch {
    return false;
  }
}

// ---- Session tokens (payload.signature) ----
export function signToken(userId, ttlMs = TOKEN_TTL_MS) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}

// ---- Cookies ----
export function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
export function sessionCookie(token, secure) {
  const flags = ['HttpOnly', 'Path=/', `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`, 'SameSite=Lax'];
  if (secure) flags.push('Secure');
  return `${COOKIE_NAME}=${token}; ${flags.join('; ')}`;
}
export function clearCookie(secure) {
  const flags = ['HttpOnly', 'Path=/', 'Max-Age=0', 'SameSite=Lax'];
  if (secure) flags.push('Secure');
  return `${COOKIE_NAME}=; ${flags.join('; ')}`;
}

// ---- Request helper ----
export function userIdFromReq(req) {
  const cookies = parseCookies(req.headers && req.headers.cookie);
  return verifyToken(cookies[COOKIE_NAME]);
}
export function isSecureReq(req) {
  const proto = req.headers && (req.headers['x-forwarded-proto'] || '');
  return String(proto).split(',')[0].trim() === 'https';
}

// ---- Validation ----
export function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}
