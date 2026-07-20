// Manuscript Mentors — data store with two interchangeable backends.
//
//  • Serverless / production: a Redis-over-REST store (Vercel KV or Upstash).
//    Enabled automatically when KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV)
//    or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set. This is the
//    ONLY way accounts/history persist on Vercel, whose filesystem is read-only.
//
//  • Local dev: a plain JSON file (data/db.json), written through a promise-chained
//    mutex. Used automatically when no KV env vars are present.
//
// Both backends expose the same async API, so the rest of the app doesn't care
// which is active.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const USING_KV = !!(KV_URL && KV_TOKEN);
export const BACKEND = USING_KV ? 'kv' : 'file';

const K = {
  counter: 'mm:counter',
  user: (id) => 'mm:user:' + id,
  email: (e) => 'mm:email:' + e,
  critList: (uid) => 'mm:crits:' + uid,
  crit: (id) => 'mm:crit:' + id,
};

const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt } : null);
const normEmail = (e) => String(e || '').trim().toLowerCase();
const cleanName = (n, email) => String(n || '').trim() || normEmail(email).split('@')[0];

// ===================== Redis-over-REST client =====================
async function kv(...args) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({ error: 'invalid KV response' }));
  if (data.error) throw new Error('KV error: ' + data.error);
  return data.result;
}
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// ===================== File backend =====================
const DB_PATH = path.join(process.cwd(), 'data', 'db.json');
const EMPTY = { users: [], critiques: [], counter: { totalCritiques: 0 } };
let chain = Promise.resolve();

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return {
      users: Array.isArray(db.users) ? db.users : [],
      critiques: Array.isArray(db.critiques) ? db.critiques : [],
      counter: db.counter && typeof db.counter.totalCritiques === 'number' ? db.counter : { totalCritiques: 0 },
    };
  } catch { return structuredClone(EMPTY); }
}
function writeDb(db) {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
  catch { /* read-only fs */ }
}
function run(fn) {
  const next = chain.then(() => { const db = readDb(); const { result, dirty } = fn(db); if (dirty) writeDb(db); return result; });
  chain = next.catch(() => {});
  return next;
}

// ===================== Public API =====================

// ---- Counter ----
export async function incrementCounter(by = 1) {
  const amount = Number(by) > 0 ? Math.trunc(Number(by)) : 0;
  if (USING_KV) {
    if (amount > 0) return Number(await kv('INCRBY', K.counter, amount)) || 0;
    return Number(await kv('GET', K.counter)) || 0;
  }
  return run((db) => { db.counter.totalCritiques += amount; return { result: db.counter.totalCritiques, dirty: amount > 0 }; });
}
export async function getCounter() {
  if (USING_KV) return Number(await kv('GET', K.counter)) || 0;
  return run((db) => ({ result: db.counter.totalCritiques, dirty: false }));
}

// ---- Users ----
export async function createUser({ email, name, salt, hash }) {
  const em = normEmail(email);
  const user = { id: crypto.randomUUID(), email: em, name: cleanName(name, em), salt, hash, createdAt: new Date().toISOString() };
  if (USING_KV) {
    // NX makes the email claim atomic — fails if the address is already taken.
    const claimed = await kv('SET', K.email(em), user.id, 'NX');
    if (claimed === null) { const err = new Error('An account with that email already exists.'); err.code = 'EMAIL_TAKEN'; throw err; }
    await kv('SET', K.user(user.id), JSON.stringify(user));
    return publicUser(user);
  }
  return run((db) => {
    if (db.users.some((u) => u.email === em)) { const err = new Error('An account with that email already exists.'); err.code = 'EMAIL_TAKEN'; throw err; }
    db.users.push(user);
    return { result: publicUser(user), dirty: true };
  });
}
export async function findUserByEmail(email) {
  const em = normEmail(email);
  if (USING_KV) {
    const id = await kv('GET', K.email(em));
    if (!id) return null;
    return parse(await kv('GET', K.user(id)));
  }
  return run((db) => ({ result: db.users.find((u) => u.email === em) || null, dirty: false }));
}
export async function findUserById(id) {
  if (USING_KV) return publicUser(parse(await kv('GET', K.user(id))));
  return run((db) => ({ result: publicUser(db.users.find((u) => u.id === id)), dirty: false }));
}

// ---- Critique sessions (history) ----
function buildRecord(userId, session) {
  return {
    id: crypto.randomUUID(),
    userId,
    createdAt: new Date().toISOString(),
    mode: session.mode || '',
    wordCount: Number(session.wordCount) || 0,
    truncated: !!session.truncated,
    excerpt: String(session.excerpt || '').slice(0, 240),
    avgScore: session.avgScore == null ? null : Number(session.avgScore),
    results: Array.isArray(session.results) ? session.results : [],
  };
}
export async function addCritique(userId, session) {
  const record = buildRecord(userId, session);
  if (USING_KV) {
    await kv('SET', K.crit(record.id), JSON.stringify(record));
    await kv('LPUSH', K.critList(userId), record.id);
    await kv('LTRIM', K.critList(userId), 0, 199); // cap history length
    return record;
  }
  return run((db) => { db.critiques.push(record); return { result: record, dirty: true }; });
}
export async function getCritiques(userId) {
  if (USING_KV) {
    const ids = (await kv('LRANGE', K.critList(userId), 0, -1)) || [];
    if (!ids.length) return [];
    const raw = await kv('MGET', ...ids.map(K.crit));
    return (raw || []).map(parse).filter(Boolean); // already newest-first (LPUSH)
  }
  return run((db) => ({
    result: db.critiques.filter((c) => c.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    dirty: false,
  }));
}
export async function deleteCritique(userId, id) {
  if (USING_KV) {
    const rec = parse(await kv('GET', K.crit(id)));
    if (!rec || rec.userId !== userId) return false;
    await kv('LREM', K.critList(userId), 0, id);
    await kv('DEL', K.crit(id));
    return true;
  }
  return run((db) => {
    const before = db.critiques.length;
    db.critiques = db.critiques.filter((c) => !(c.id === id && c.userId === userId));
    return { result: db.critiques.length < before, dirty: db.critiques.length < before };
  });
}
