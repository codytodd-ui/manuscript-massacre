// GET /api/auth/me -> { user } (or { user: null } if not signed in)
import { userIdFromReq } from '../../lib/auth.js';
import { findUserById } from '../../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed. Use GET.' }); return; }
  const uid = userIdFromReq(req);
  const user = uid ? await findUserById(uid) : null;
  res.status(200).json({ user: user || null });
}
