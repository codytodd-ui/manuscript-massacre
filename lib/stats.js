// Tiny file-backed counter for "critiques delivered so far."
// Not a database — just enough persistence for a hobby-scale site. On a
// read-only filesystem (some serverless platforms) writes silently no-op,
// so the count simply won't survive a cold start there; it still works
// fine on any long-lived Node process (e.g. the bundled server.mjs).

import fs from 'node:fs';
import path from 'node:path';

const STATS_PATH = path.join(process.cwd(), 'data', 'stats.json');

export function readStats() {
  try {
    const raw = fs.readFileSync(STATS_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return { totalCritiques: Math.max(0, Math.trunc(Number(obj.totalCritiques)) || 0) };
  } catch {
    return { totalCritiques: 0 };
  }
}

export function incrementStats(by) {
  const current = readStats();
  if (!by || by < 1) return current;
  const next = { totalCritiques: current.totalCritiques + by };
  try {
    fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true });
    fs.writeFileSync(STATS_PATH, JSON.stringify(next, null, 2));
  } catch {
    // Read-only filesystem — the count just won't persist here.
  }
  return next;
}
