// /api/history — the signed-in user's saved critique sessions.
//   GET    -> { critiques: [...] }
//   POST   { mode, wordCount, truncated, excerpt, avgScore, results } -> { critique }
//   DELETE { id }  (or ?id=)  -> { ok }
import { userIdFromReq } from '../lib/auth.js';
import { getCritiques, addCritique, deleteCritique } from '../lib/store.js';

export default async function handler(req, res) {
  const uid = userIdFromReq(req);
  if (!uid) { res.status(401).json({ error: 'Please sign in.' }); return; }

  if (req.method === 'GET') {
    const critiques = await getCritiques(uid);
    res.status(200).json({ critiques });
    return;
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    if (!Array.isArray(body.results) || body.results.length === 0) {
      res.status(400).json({ error: 'Nothing to save.' });
      return;
    }
    const record = await addCritique(uid, {
      mode: body.mode,
      wordCount: body.wordCount,
      truncated: body.truncated,
      excerpt: body.excerpt,
      avgScore: body.avgScore,
      results: body.results,
    });
    res.status(200).json({ critique: record });
    return;
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const id = body.id || (req.url && new URL(req.url, 'http://x').searchParams.get('id'));
    if (!id) { res.status(400).json({ error: 'Missing id.' }); return; }
    const ok = await deleteCritique(uid, id);
    res.status(ok ? 200 : 404).json({ ok });
    return;
  }

  res.status(405).json({ error: 'Method not allowed.' });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
