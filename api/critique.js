// Manuscript Mentors — serverless critique endpoint (Vercel-style Node function).
// POST { text, personaIds: string[], mode } -> { results: [{ id, name, verdict, score, critique }] }
//
// Requires env ANTHROPIC_API_KEY. Optional env ANTHROPIC_MODEL (default: claude-sonnet-5).

import fs from 'node:fs';
import path from 'node:path';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_CHARS = 30000; // manuscript characters sent per critique call
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Critique modes: each shapes tone + focus. Keys must match the front-end.
const MODES = {
  roast: {
    label: 'Harsh Roast',
    instruction:
      'Mode: HARSH ROAST. Be brutal, savage, and merciless — hold nothing back. But you are a serious critic, not a random heckler: every cutting remark must rest on a real, specific weakness in the writing. Mockery without substance is beneath you. Draw blood, but earn it. Stay in character.',
  },
  balanced: {
    label: 'Balanced Critique',
    instruction:
      'Mode: BALANCED CRITIQUE. Be fair and even-handed. Name genuine strengths and genuine weaknesses in roughly equal measure, with concrete examples for each. Aim to leave the author both encouraged and clearly instructed. Stay in character.',
  },
  kind: {
    label: 'Kind & Encouraging',
    instruction:
      'Mode: KIND & ENCOURAGING. Be warm, generous, and affirming. Lead with what genuinely works and why. Where the writing falls short, frame it as invitation and possibility rather than failure — but never lie or flatter emptily; your kindness is honest. Stay in character.',
  },
  craft: {
    label: 'Craft & Style',
    instruction:
      'Mode: CRAFT & STYLE FOCUS. Concentrate on the writing itself — sentence rhythm, diction, structure, pacing, imagery, point of view, dialogue, and mechanics. Quote specific lines and show precisely how they could be sharpened. Spend little time on theme; this is about the machinery of the prose. Stay in character.',
  },
  thematic: {
    label: 'Themes & Ideas',
    instruction:
      'Mode: DEEP THEMATIC ANALYSIS. Concentrate on ideas, meaning, worldview, and thematic coherence. What is this work really about, what is it claiming about the world, where are its ideas rich, shallow, contradictory, or unearned? Engage the substance as a serious thinker would. Stay in character.',
  },
};

function loadPersonas() {
  // personas.json lives at <projectRoot>/data/personas.json
  const p = path.join(process.cwd(), 'data', 'personas.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function buildSystemPrompt(persona, mode) {
  return [
    persona.profile,
    '',
    `Your critical lens: ${persona.lens}`,
    '',
    mode.instruction,
    '',
    'You are mentoring the author of a piece of writing submitted to "Manuscript Mentors." Speak entirely in your own voice and sensibility. Be specific: refer to actual moments, lines, or choices in the text rather than generic praise or complaint. Do not summarize the piece back to the author; they know what they wrote.',
    '',
    'Respond with ONLY a JSON object (no markdown fences, no preamble) of exactly this shape:',
    '{',
    '  "verdict": "one vivid sentence, max ~20 words, delivering your overall judgement in your voice",',
    '  "score": <integer 0-100 — your rating of the writing on its own terms>,',
    '  "critique": "your full critique, 150-350 words, in your voice. Use plain paragraphs; you may use short markdown like **bold** or a bulleted list, but no headings."',
    '}',
  ].join('\n');
}

async function critiqueAsPersona(persona, mode, manuscript, apiKey) {
  const system = buildSystemPrompt(persona, mode);
  const body = {
    model: MODEL,
    max_tokens: 1200,
    system,
    messages: [
      {
        role: 'user',
        content: `Here is the writing to critique:\n\n<manuscript>\n${manuscript}\n</manuscript>`,
      },
    ],
  };

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status}: ${detail.slice(0, 300)}`);
  }

  const data = await resp.json();
  const raw = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return parseCritique(raw);
}

function parseCritique(raw) {
  // Strip accidental code fences, then find the JSON object.
  let s = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  try {
    const obj = JSON.parse(s);
    return {
      verdict: String(obj.verdict || '').trim(),
      score: clampScore(obj.score),
      critique: String(obj.critique || '').trim(),
    };
  } catch {
    // Fallback: the model didn't give clean JSON — surface its prose anyway.
    return { verdict: '', score: null, critique: raw };
  }
}

function clampScore(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(100, x));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'Server is missing ANTHROPIC_API_KEY. Set it in your deployment environment variables.',
    });
    return;
  }

  // Body may arrive parsed (Vercel) or as a raw string; handle both.
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  payload = payload || {};

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const personaIds = Array.isArray(payload.personaIds) ? payload.personaIds : [];
  const modeKey = typeof payload.mode === 'string' ? payload.mode : '';

  if (!text) {
    res.status(400).json({ error: 'No manuscript text provided.' });
    return;
  }
  if (text.length < 40) {
    res.status(400).json({ error: 'That is too short to critique. Give the mentors something to work with (at least ~40 characters).' });
    return;
  }
  if (personaIds.length === 0) {
    res.status(400).json({ error: 'Choose at least one mentor.' });
    return;
  }
  if (personaIds.length > 5) {
    res.status(400).json({ error: 'You may choose at most 5 mentors.' });
    return;
  }
  const mode = MODES[modeKey];
  if (!mode) {
    res.status(400).json({ error: 'Unknown critique mode.' });
    return;
  }

  const allPersonas = loadPersonas();
  const byId = new Map(allPersonas.map((p) => [p.id, p]));
  const chosen = personaIds.map((id) => byId.get(id)).filter(Boolean);
  if (chosen.length === 0) {
    res.status(400).json({ error: 'None of the selected mentors were recognized.' });
    return;
  }

  const manuscript = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const truncated = text.length > MAX_CHARS;

  try {
    const settled = await Promise.allSettled(
      chosen.map((p) => critiqueAsPersona(p, mode, manuscript, apiKey))
    );

    const results = settled.map((outcome, i) => {
      const p = chosen[i];
      if (outcome.status === 'fulfilled') {
        return { id: p.id, name: p.name, tag: p.tag, ...outcome.value };
      }
      return {
        id: p.id,
        name: p.name,
        tag: p.tag,
        verdict: '',
        score: null,
        critique: '',
        error: 'This critic could not be reached. Try again.',
      };
    });

    res.status(200).json({ mode: mode.label, truncated, results });
  } catch (err) {
    res.status(500).json({ error: `Critique failed: ${err.message}` });
  }
}
