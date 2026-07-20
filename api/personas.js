// Manuscript Mentors — GET /api/personas -> { personas: [...] }
// Served from a function (not a static file) so it's reliably available on any
// host, including serverless. Bundled via vercel.json includeFiles.
import fs from 'node:fs';

let cache = null;
function load() {
  if (!cache) cache = JSON.parse(fs.readFileSync(new URL('../data/personas.json', import.meta.url), 'utf8'));
  return cache;
}

export default function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed. Use GET.' }); return; }
  res.status(200).json({ personas: load() });
}
