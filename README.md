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
  `.docx`, and `.pdf` uploads (DOCX/PDF parsed in-browser via CDN libraries), or plain paste.
- **Back end** — one serverless function, [`api/critique.js`](api/critique.js), that
  calls the Anthropic Messages API once per selected mentor (in parallel) and returns
  each one's verdict, score, plain-English summary, and full critique.
- **Data** — all 50 mentors and their critiquing profiles live in
  [`data/personas.json`](data/personas.json).
- **Critique counter** — a small site-wide counter of critiques delivered, shown under
  the hero. `GET /api/stats` reads it, and every successful critique call increments
  it. It's backed by a plain file ([`data/stats.json`](data/stats.json), created at
  runtime, gitignored — see [`lib/stats.js`](lib/stats.js)), which persists fine on the
  bundled `server.mjs` but may reset on cold starts on some serverless platforms.

A pure static page can't call an LLM, so this ships as a real app with a tiny backend.

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
3. In **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY`.
   (Optionally add `ANTHROPIC_MODEL`.)
4. Deploy. You'll get a public URL you can share.

### Netlify

Works too — move `api/critique.js` and `api/stats.js` (and `lib/stats.js`, adjusting
their relative import) into `netlify/functions/`, change the front-end fetch URLs from
`api/critique` / `api/stats` to `/.netlify/functions/critique` / `/.netlify/functions/stats`,
and set `ANTHROPIC_API_KEY` in Netlify's environment variables.

## Configuration

| Env var             | Required | Default            | Purpose                          |
| ------------------- | -------- | ------------------ | -------------------------------- |
| `ANTHROPIC_API_KEY` | yes      | —                  | Auth for the Anthropic API       |
| `ANTHROPIC_MODEL`   | no       | `claude-sonnet-5`  | Model used to generate critiques |

Manuscripts are truncated to the first ~30,000 characters per critique to keep
token usage sane; the UI flags when this happens.

## Notes

- Feedback is **AI-generated** in the spirit of each figure's known sensibility and
  style — not the real person, and not their actual opinions.
- Each run makes up to 5 API calls (one per mentor). Watch your Anthropic usage.
- Nothing is stored: text is sent to the function, critiqued, and returned.
