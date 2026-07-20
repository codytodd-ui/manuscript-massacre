# 📜 Manuscript Mentors

Hand your writing to the masters. Paste or upload your work, gather **up to 5 of 50**
great minds — saints, novelists, poets, philosophers, and sharp-eyed wits — and
choose exactly how you'd like to be mentored.

**Critique styles**

- 🔥 **Tough Love** — blunt and unsparing, but every note is earned
- ⚖️ **Balanced Critique** — fair, strengths and weaknesses
- 🕊️ **Kind & Encouraging** — warm and generous, honest but gentle
- ✍️ **Craft & Style** — sentences, rhythm, structure, mechanics
- 🧠 **Themes & Ideas** — meaning, worldview, thematic coherence

Each mentor reads with their own wisdom and voice — Augustine hunts your disordered
loves, Hemingway strikes every false word, Ursula K. Le Guin tunes the rhythm of
your sentences. The roster includes Augustine of Hippo, Dietrich Bonhoeffer, Timothy
Keller, Francis of Assisi, Walter Rauschenbusch, Leo Tolstoy, and Jürgen Moltmann,
plus 43 more.

---

## How it works

- **Front end** — a single static `index.html` (no build step). Reads `.txt`, `.md`,
  `.docx`, and `.pdf` uploads (DOCX/PDF parsed in-browser via CDN libraries), or plain
  paste. Critiques stream in per-mentor, and you can export any run as **PDF**,
  **Markdown**, or copy it as text. Your draft (text, mentors, style) is remembered in
  `localStorage`.
- **Critique API** — [`api/critique.js`](api/critique.js) calls the Anthropic Messages
  API for one mentor per request and returns its verdict, score, plain-English summary,
  and full critique. It is IP **rate-limited**, retries transient upstream errors once,
  and times out hung calls.
- **Accounts & dashboard** — create an account and your critiques are saved to a
  personal dashboard you can revisit, re-export, or delete. Auth endpoints:
  `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`; history: `GET/POST/DELETE /api/history`. Passwords are hashed with
  scrypt; sessions are signed HttpOnly-cookie tokens ([`lib/auth.js`](lib/auth.js)).
- **Data** — the 50 mentors live in [`data/personas.json`](data/personas.json). Users,
  saved critiques, and the site-wide critique counter live in `data/db.json`, a plain
  JSON file written through a small store ([`lib/store.js`](lib/store.js)). `GET /api/stats`
  exposes the counter shown under the hero.

A pure static page can't call an LLM or hold accounts, so this ships as a real app with
a small backend.

> **Where data lives.** [`lib/store.js`](lib/store.js) has two backends and picks one
> automatically: a **Redis/KV** store when `KV_REST_API_URL` + `KV_REST_API_TOKEN`
> (Vercel KV) or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, otherwise
> the local `data/db.json` file. Use the file locally (`npm start`); **add a KV store on
> Vercel** (see Deploy below), since its filesystem is read-only and the file store can't
> persist there.

## Run it locally

Requires only **Node 18+** — no Vercel CLI needed. The bundled `server.mjs` serves
the page and runs the `/api/critique` endpoint together.

```bash
cd manuscript-mentors

# macOS / Linux / Git Bash:
ANTHROPIC_API_KEY=sk-ant-... npm start

# Windows PowerShell:
$env:ANTHROPIC_API_KEY="sk-ant-..."; npm start
```

Then open **http://localhost:3000**.

> Keep your API key out of files — pass it as an environment variable (as above).
> `.env.local` is gitignored if you prefer to keep it there, but never commit a key.

Prefer the Vercel toolchain? `npm run dev:vercel` runs `vercel dev` instead (needs
the [Vercel CLI](https://vercel.com/docs/cli) and a `.env.local`).

> The `/api/critique` endpoint only works through a running server (`npm start` or a
> deploy). Opening `index.html` straight from disk will show the UI and let you pick
> mentors, but "Summon your mentors" needs the backend.

## Deploy (get a shareable URL)

### Vercel (recommended, ~2 minutes)

1. Push this folder to a GitHub repo (or run `vercel` in the folder).
2. Import it at [vercel.com/new](https://vercel.com/new).
3. In **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY` and a
   strong random `SESSION_SECRET`. (Optionally add `ANTHROPIC_MODEL`.)
4. **For accounts & saved history, add a KV store** (required — see below).
5. Deploy. You'll get a public URL you can share.

#### Accounts on Vercel need a KV store (important)

Vercel's filesystem is **read-only**, so the local file store can't save accounts there —
signups won't persist and login won't work. Add a Redis-compatible KV store and the app
switches to it automatically:

1. In your Vercel project → **Storage → Create Database → Upstash for Redis** (Vercel KV),
   and connect it to the project.
2. That injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars automatically
   (Upstash's `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are also recognized).
3. **Redeploy.** On boot the store uses KV when those vars are present (falling back to
   the local file only for `npm start`). No code changes needed.

The roster is served from `GET /api/personas` (a function), so the mentor list and the
login/critique UI load reliably even where static-file serving behaves unexpectedly.

### Netlify

Works too, but takes more wiring: move each function under `api/` into
`netlify/functions/` (keeping `lib/` importable), remap the front-end fetch URLs
(`api/critique` → `/.netlify/functions/critique`, etc.), and set `ANTHROPIC_API_KEY` and
`SESSION_SECRET`. As with Vercel, accounts/history need a real database rather than the
bundled file store.

## Configuration

| Env var             | Required | Default            | Purpose                                         |
| ------------------- | -------- | ------------------ | ----------------------------------------------- |
| `ANTHROPIC_API_KEY` | yes      | —                  | Auth for the Anthropic API                      |
| `ANTHROPIC_MODEL`   | no       | `claude-sonnet-5`  | Model used to generate critiques                |
| `SESSION_SECRET`    | no*      | insecure default   | HMAC secret that signs login session cookies    |

\* Optional for local tinkering, but **set a strong random `SESSION_SECRET` for any real
deployment** — otherwise session cookies are signed with a public default and could be
forged. The server prints a warning when the default is in use.

Manuscripts are truncated to the first ~30,000 characters per critique to keep
token usage sane; the UI flags when this happens.

## Notes

- Feedback is **AI-generated** in the spirit of each figure's known sensibility and
  style — not the real person, and not their actual opinions.
- Each run makes up to 5 API calls (one per mentor). Watch your Anthropic usage.
- Your manuscript text is sent to the API to be critiqued. If you're **not** signed in,
  nothing is retained. If you **are** signed in, each run is saved to your dashboard
  (in `data/db.json`) until you delete it.
