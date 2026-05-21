// api/jarvis.js — Freedom OS JARVIS Edge Function
// Secure proxy: Browser → This Function → Groq API

const conversationMemory = new Map();

const SYSTEM_PROMPT = `You are JARVIS — the holographic AI assistant of Freedom OS. You are NOT a chatbot. You are a personal operator — confident, sharp, slightly ahead of the user. You speak in clean, decisive statements. No "I'm sorry" or "As an AI." Tone: "Got it. Here's what we're doing."

JARVIS knows:
- The user's mission: Build a brand to retire his mom through content creation
- Sponsor: Jitter-free energy drink brand
- Audience: TikTok-native aspiring teen entrepreneurs
- Vibe: Operator energy. Mission control. Wealth building. Disciplined but bold.

Freedom OS State Schema (JARVIS can suggest mutations to these):
- wins[]: {id, title, category, date, description}. Categories: Revenue, Viral, Milestone, Personal, Launch, Other
- dayLog.logs[]: {date, whatILearned, ideas, wins, notes, tomorrowsFocus}
- projects[]: {id, name, status, hypothesis, model, created}
- people[]: {id, name, platform, category, followUpDate, notes}
- dashboard.habits[]: {id, name, category, streak, lastCompleted}
- finance.ledger[]: {id, type, amount, date, note, projectId}
- creatorStudio.pipeline[]: {id, title, platform, status, hook, script, views, retention}
- reviews[]: {id, weekStart, wins, flops, focus, score}
- letters[]: {id, title, content, unlockDate}
- roadmap.quarters[]: {id, title, description, status, milestones[]}

JARVIS can suggest actions by including them in your response:
- log_win: {title, category, description}
- log_person: {name, platform, category}
- log_learned: {content}
- start_project: {name, model, hypothesis}
- navigate: {route}
- show_file: {path}
- highlight_code: {path, startLine, endLine, replacement}

CRITICAL: You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.
Response format:
{
  "message": "Your response here (string, required)",
  "actions": [{"type": "action_name", "payload": {...}}],
  "log_suggestion": {"type": "log_win", "data": {...}}
}

The actions array and log_suggestion are optional. message is always required.
Keep responses sharp, direct, and operator-coded. You're running mission control.`;

async function callGroqWithRetry(messages, apiKey, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.7,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      });

      if (response.status === 429) {
        lastError = new Error('Rate limit hit');
        lastError.status = 429;
        console.warn(`[JARVIS] Rate limit hit, attempt ${attempt + 1}/${maxRetries}`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`Groq API error: ${response.status} — ${errorText}`);
        lastError.status = response.status;
        throw lastError;
      }

      return await response.json();
    } catch (err) {
      if (err.status === 429) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export default async function handler(req, res) {
  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(204).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Set CORS on all responses
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Content-Type', 'application/json');

  // Read API Key
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[JARVIS] GROQ_API_KEY not set in environment variables');
    return res.status(500).json({
      message: 'System misconfiguration. API key missing.',
      _provider: 'groq',
      _model: 'llama-3.3-70b-versatile',
    });
  }

  // Parse request body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    console.error('[JARVIS] Failed to parse request body:', err.message);
    return res.status(400).json({
      message: 'Invalid JSON in request body.',
      _provider: 'groq',
      _model: 'llama-3.3-70b-versatile',
    });
  }

  const { message, sessionId, context } = body || {};

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({
      message: 'Field "message" is required and must be a non-empty string.',
      _provider: 'groq',
      _model: 'llama-3.3-70b-versatile',
    });
  }

  const session = sessionId || 'default';

  // Get or init conversation history
  if (!conversationMemory.has(session)) {
    conversationMemory.set(session, []);
  }
  const history = conversationMemory.get(session);

  // Build context message if provided
  let userContent = message.trim();
  if (context && typeof context === 'object') {
    userContent = `[CONTEXT: ${JSON.stringify(context)}]\n\n${userContent}`;
  }

  // Add user message to history
  history.push({ role: 'user', content: userContent });

  // Keep history manageable (last 20 messages = 10 turns)
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ];

  try {
    const groqResponse = await callGroqWithRetry(messages, apiKey);
    
    const rawContent = groqResponse.choices?.[0]?.message?.content;
    
    if (!rawContent) {
      console.error('[JARVIS] Empty response from Groq:', JSON.stringify(groqResponse));
      return res.status(502).json({
        message: 'No response from AI backend.',
        _provider: 'groq',
        _model: 'llama-3.3-70b-versatile',
      });
    }

    // Parse the JSON response from the model
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('[JARVIS] Failed to parse model JSON response:', rawContent);
      // Fallback: treat raw content as message
      parsed = { message: rawContent };
    }

    // Add assistant response to memory
    history.push({ role: 'assistant', content: rawContent });

    // Extract log_suggestion from actions if embedded
    let logSuggestion = parsed.log_suggestion || null;
    if (!logSuggestion && Array.isArray(parsed.actions)) {
      const logAction = parsed.actions.find(a => 
        ['log_win', 'log_learned', 'log_person', 'start_project'].includes(a.type)
      );
      if (logAction) {
        logSuggestion = { type: logAction.type, data: logAction.payload };
      }
    }

    return res.status(200).json({
      message: parsed.message || 'Acknowledged.',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      log_suggestion: logSuggestion,
      _provider: 'groq',
      _model: groqResponse.model || 'llama-3.3-70b-versatile',
    });

  } catch (err) {
    console.error('[JARVIS] Groq call failed:', err.message);
    
    if (err.status === 429) {
      return res.status(429).json({
        message: 'Rate limit hit. Slow down — we\'re rebuilding.',
        _provider: 'groq',
        _model: 'llama-3.3-70b-versatile',
      });
    }

    return res.status(502).json({
      message: 'Backend unreachable. JARVIS is rerouting.',
      _provider: 'groq',
      _model: 'llama-3.3-70b-versatile',
    });
  }
}