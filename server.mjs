// Standalone local server for Manuscript Mentors.
// Serves the static site AND runs the /api functions by reusing them directly —
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

import critiqueHandler from './api/critique.js';
import statsHandler from './api/stats.js';
import personasHandler from './api/personas.js';
import signupHandler from './api/auth/signup.js';
import loginHandler from './api/auth/login.js';
import logoutHandler from './api/auth/logout.js';
import meHandler from './api/auth/me.js';
import historyHandler from './api/history.js';
import { USING_DEFAULT_SECRET } from './lib/auth.js';

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

const API_HANDLERS = {
  '/api/critique': critiqueHandler,
  '/api/stats': statsHandler,
  '/api/personas': personasHandler,
  '/api/auth/signup': signupHandler,
  '/api/auth/login': loginHandler,
  '/api/auth/logout': logoutHandler,
  '/api/auth/me': meHandler,
  '/api/history': historyHandler,
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
  const apiHandler = API_HANDLERS[pathname];

  if (apiHandler) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

    // Shim just enough of Vercel's req/res onto Node's http objects.
    const outHeaders = {};
    const shimRes = {
      statusCode: 200,
      setHeader(k, v) { outHeaders[k] = v; },
      getHeader(k) { return outHeaders[k]; },
      status(code) { this.statusCode = code; return this; },
      json(obj) {
        res.writeHead(this.statusCode, { ...outHeaders, 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
        return this;
      },
      end(data) { res.writeHead(this.statusCode, outHeaders); res.end(data); return this; },
    };
    const shimReq = { method: req.method, headers: req.headers, url: req.url, body, socket: req.socket };

    try {
      await apiHandler(shimReq, shimRes);
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
  if (USING_DEFAULT_SECRET) {
    console.warn('⚠  SESSION_SECRET is not set — using an insecure default. Set SESSION_SECRET for real use.');
  }
  console.log(`📜 Manuscript Mentors running at http://localhost:${PORT}`);
});
