// POST /api/auth/signup { email, password, name } -> sets session cookie, returns { user }
import { hashPassword, signToken, sessionCookie, isSecureReq, validateEmail, validatePassword } from '../../lib/auth.js';
import { createUser } from '../../lib/store.js';
import { rateLimit, clientIp } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed. Use POST.' }); return; }

  const limit = rateLimit(`auth:${clientIp(req)}`, { limit: 20, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) { res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' }); return; }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!validateEmail(email)) { res.status(400).json({ error: 'Please enter a valid email address.' }); return; }
  if (!validatePassword(password)) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }

  try {
    const { salt, hash } = hashPassword(password);
    const user = await createUser({ email, name, salt, hash });
    const token = signToken(user.id);
    res.setHeader('Set-Cookie', sessionCookie(token, isSecureReq(req)));
    res.status(200).json({ user });
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN') { res.status(409).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
