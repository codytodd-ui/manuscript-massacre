// POST /api/auth/logout -> clears the session cookie
import { clearCookie, isSecureReq } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed. Use POST.' }); return; }
  res.setHeader('Set-Cookie', clearCookie(isSecureReq(req)));
  res.status(200).json({ ok: true });
}
