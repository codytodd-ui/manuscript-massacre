// Standalone local server for Manuscript Mentors.
// Serves the static site AND runs /api/critique by reusing api/critique.js —
// so you can run the whole app locally without the Vercel CLI:
//
//   ANTHROPIC_API_KEY=sk-ant-... node server.mjs
//   (PowerShell:  $env:ANTHROPIC_API_KEY="sk-ant-..."; node server.mjs)
//
// Then open http://localhost:3000

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/critique.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(__dirname, urlPath);
  if (!file.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];

  if (pathname === '/api/critique') {
    // Read the request body, then hand off to the same function Vercel would call.
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

    // Shim Vercel's res.status().json() onto the Node response.
    const shim = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(obj) {
        res.writeHead(this.statusCode, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
        return this;
      },
    };
    try {
      await handler({ method: req.method, body }, shim);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error: ' + err.message }));
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY is not set — critiques will fail until you set it.');
  }
  console.log(`📜 Manuscript Mentors running at http://localhost:${PORT}`);
});
