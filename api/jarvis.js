// api/jarvis.js — Vercel Serverless Function
// Replaces server.js + Cloudflare Worker entirely.
// GROQ_API_KEY lives in Vercel Dashboard → Settings → Environment Variables
// To swap providers later: change GROQ_BASE_URL and GROQ_MODEL env vars.

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const API_KEY = process.env.GROQ_API_KEY;

// In-memory session store (resets per cold start — good enough for chat context)
const sessions = new Map();

function getMemory(sessionId) {
  return sessions.get(sessionId) || [];
}

function addToMemory(sessionId, role, content) {
  const mem = getMemory(sessionId);
  mem.push({ role, content });
  if (mem.length > 8) mem.splice(0, 2); // Keep last 4 exchanges
  sessions.set(sessionId, mem);
}

const SYSTEM_PROMPT = `You are JARVIS, the holographic AI assistant embedded in Freedom OS — a vanilla JS SPA built by a teen entrepreneur.

BRAND IDENTITY:
- Colors: Primary #00d4aa (teal), Accent #7c3aed (purple), Background #08090f
- Typography: Inter for UI, JetBrains Mono for data/code
- Visual: Dark space aesthetic, radial-gradient glows, glassmorphism
- Rules: Vanilla JS only. ES6 modules. CSS custom properties. Mobile-first.

FREEDOM OS STATE SCHEMA (you can suggest logging to these):
- wins[]: {id, title, category, date, description}. Categories: Revenue, Viral, Milestone, Personal, Launch, Other
- dayLog.logs[]: {date, whatILearned, ideas, wins, notes, tomorrowsFocus}
- projects[]: {id, name, status, hypothesis, created}
- people[]: {id, name, platform, followUpDate, notes}
- dashboard.habits[]: {id, name, category, streak, lastCompleted}
- finance.ledger[]: {id, type, amount, date, note}

If the user describes a win, lesson, idea, contact, or project, include a log_suggestion in your response.

RESPONSE FORMAT (strict JSON):
{
  "message": "Your response here...",
  "log_suggestion": {
    "type": "win|learned|project|person",
    "title": "...",
    "category": "Revenue|Viral|Milestone|Personal|Launch|Other",
    "description": "...",
    "whatILearned": "...",
    "name": "...",
    "platform": "..."
  }
}

Only include log_suggestion when relevant. message is always required.`;

export default async function handler(req, res) {
  // CORS — update origin to your actual Vercel domain
  const allowedOrigins = [
    process.env.ALLOWED_ORIGIN || '',
    'http://localhost:3000',
    'http://localhost:5500',
  ].filter(Boolean);

  const origin = req.headers.origin || '';
  // Allow any vercel.app subdomain + your custom domain
  const isAllowed = allowedOrigins.includes(origin) ||
    origin.endsWith('.vercel.app') ||
    origin.endsWith('.netlify.app');

  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : allowedOrigins[0] || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!API_KEY) {
    return res.status(500).json({
      error: 'GROQ_API_KEY not configured',
      fix: 'Add GROQ_API_KEY in Vercel Dashboard → Settings → Environment Variables'
    });
  }

  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // Use IP as session fallback if no sessionId provided
  const sid = sessionId || req.headers['x-forwarded-for'] || 'default';
  const memory = getMemory(sid);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...memory.slice(-6),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Groq error:', err);
      return res.status(502).json({ error: 'Groq API error', details: err });
    }

    const data = await response.json();
    let aiResponse;

    try {
      aiResponse = JSON.parse(data.choices[0].message.content);
    } catch {
      // If JSON parse fails, wrap raw text
      aiResponse = { message: data.choices[0].message.content };
    }

    addToMemory(sid, 'user', message);
    addToMemory(sid, 'assistant', aiResponse.message || '');

    return res.status(200).json({
      ...aiResponse,
      _provider: 'groq',
      _model: MODEL
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}