// POST /api/auth/login { email, password } -> sets session cookie, returns { user }
import { verifyPassword, signToken, sessionCookie, isSecureReq } from '../../lib/auth.js';
import { findUserByEmail } from '../../lib/store.js';
import { rateLimit, clientIp } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed. Use POST.' }); return; }

  const limit = rateLimit(`auth:${clientIp(req)}`, { limit: 20, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) { res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' }); return; }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const user = await findUserByEmail(email);
  // Same generic message whether the email is unknown or the password is wrong.
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    res.status(401).json({ error: 'Incorrect email or password.' });
    return;
  }

  const token = signToken(user.id);
  res.setHeader('Set-Cookie', sessionCookie(token, isSecureReq(req)));
  res.status(200).json({ user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
