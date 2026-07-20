// Manuscript Mentors — tiny file-backed data store.
//
// Holds users, their saved critique sessions, and the global critique counter
// in a single JSON file (data/db.json). All writes go through a promise-chained
// mutex so concurrent requests can't interleave a read-modify-write.
//
// This is deliberately dependency-free so the bundled server.mjs "just works".
// It persists on any long-lived Node process. On ephemeral/serverless
// filesystems (e.g. Vercel) it will reset on cold starts — swap this module for
// a real database (Postgres, Vercel KV, Upstash) for production persistence.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');
const EMPTY = { users: [], critiques: [], counter: { totalCritiques: 0 } };

let chain = Promise.resolve();

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return {
      users: Array.isArray(db.users) ? db.users : [],
      critiques: Array.isArray(db.critiques) ? db.critiques : [],
      counter: db.counter && typeof db.counter.totalCritiques === 'number'
        ? db.counter : { totalCritiques: 0 },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function writeDb(db) {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch {
    // Read-only filesystem — changes just won't persist here.
  }
}

// Serialize all reads and writes through one chain for a consistent view.
function run(fn) {
  const next = chain.then(() => {
    const db = readDb();
    const { result, dirty } = fn(db);
    if (dirty) writeDb(db);
    return result;
  });
  chain = next.catch(() => {});
  return next;
}

const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });

// ---- Counter ----
export function incrementCounter(by = 1) {
  const amount = Number(by) > 0 ? Math.trunc(Number(by)) : 0;
  return run((db) => {
    db.counter.totalCritiques += amount;
    return { result: db.counter.totalCritiques, dirty: amount > 0 };
  });
}
export function getCounter() {
  return run((db) => ({ result: db.counter.totalCritiques, dirty: false }));
}

// ---- Users ----
export function createUser({ email, name, salt, hash }) {
  return run((db) => {
    const normalized = String(email).trim().toLowerCase();
    if (db.users.some((u) => u.email === normalized)) {
      const err = new Error('An account with that email already exists.');
      err.code = 'EMAIL_TAKEN';
      throw err;
    }
    const user = {
      id: crypto.randomUUID(),
      email: normalized,
      name: String(name || '').trim() || normalized.split('@')[0],
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return { result: publicUser(user), dirty: true };
  });
}
export function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return run((db) => ({ result: db.users.find((u) => u.email === normalized) || null, dirty: false }));
}
export function findUserById(id) {
  return run((db) => ({ result: publicUser(db.users.find((u) => u.id === id)), dirty: false }));
}

// ---- Critique sessions (history) ----
export function addCritique(userId, session) {
  return run((db) => {
    const record = {
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
    db.critiques.push(record);
    return { result: record, dirty: true };
  });
}
export function getCritiques(userId) {
  return run((db) => ({
    result: db.critiques
      .filter((c) => c.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    dirty: false,
  }));
}
export function deleteCritique(userId, id) {
  return run((db) => {
    const before = db.critiques.length;
    db.critiques = db.critiques.filter((c) => !(c.id === id && c.userId === userId));
    return { result: db.critiques.length < before, dirty: db.critiques.length < before };
  });
}
