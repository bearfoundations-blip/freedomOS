require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = process.cwd();

// CORS: Allow your Netlify frontend to talk to this API
app.use(cors({
  origin: ['https://freedomosv5.netlify.app', 'http://localhost:3000', 'http://localhost:5500'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight (OPTIONS) requests for all routes
app.options('*', cors());

// Provider config
const PROVIDER = process.env.AI_PROVIDER || 'mock';
const MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

let openaiClient = null;

function initClient() {
  if (PROVIDER === 'openai') {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://api.openai.com/v1'
    });
    return { provider: 'openai', model: process.env.AI_MODEL || 'gpt-4o' };
  }

  if (PROVIDER === 'groq') {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ 
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    });
    return { provider: 'groq', model: process.env.AI_MODEL || 'llama-3.3-70b-versatile' };
  }

  if (PROVIDER === 'ollama') {
    return { provider: 'ollama', model: process.env.AI_MODEL || 'qwen2.5-coder:14b' };
  }

  return { provider: 'mock', model: 'mock' };
}

const config = initClient();

app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

function isPathSafe(requestedPath) {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  return resolved.startsWith(PROJECT_ROOT) && 
         !resolved.includes('node_modules') &&
         !resolved.includes('.env');
}

function loadManifest() {
  const manifestPath = path.join(PROJECT_ROOT, 'jarvis-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error('Failed to load manifest:', e);
    return null;
  }
}

function loadLayout() {
  const layoutPath = path.join(PROJECT_ROOT, 'jarvis-layout.json');
  if (!fs.existsSync(layoutPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  } catch (e) {
    console.error('Failed to load layout:', e);
    return null;
  }
}

function loadKnowledgebase() {
  const kbPath = path.join(PROJECT_ROOT, 'jarvis-kb.json');
  if (!fs.existsSync(kbPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  } catch (e) {
    console.error('Failed to load knowledgebase:', e);
    return null;
  }
}

// Conversation memory (last 4 exchanges per session)
const conversationMemory = new Map();

function getMemory(sessionId) {
  return conversationMemory.get(sessionId) || [];
}

function addToMemory(sessionId, role, content) {
  const mem = getMemory(sessionId);
  mem.push({ role, content, timestamp: Date.now() });
  if (mem.length > 8) mem.splice(0, 2); // Keep last 4 exchanges
  conversationMemory.set(sessionId, mem);
}

app.get('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'Path required' });
  }

  const cleanPath = filePath.replace(/^\.\/|^\//, '');
  const fullPath = path.join(PROJECT_ROOT, cleanPath);

  if (!isPathSafe(fullPath)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ path: cleanPath, content });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

app.get('/api/manifest', (req, res) => {
  const manifest = loadManifest();
  if (!manifest) {
    return res.status(404).json({ 
      error: 'Manifest not found',
      fix: 'Run: node scanner.js' 
    });
  }
  res.json(manifest);
});

function buildSystemPrompt() {
  const layout = loadLayout();
  const kb = loadKnowledgebase();

  let layoutContext = '';
  if (layout) {
    layoutContext = '\n\nVISUAL LAYOUT MAP:\n';
    if (layout.structure && layout.structure.views && layout.structure.views.length) {
      layoutContext += 'Views: ' + layout.structure.views.map(v => v.name).join(', ') + '\n';
    }
    if (layout.css && layout.css.allAnimations && layout.css.allAnimations.length) {
      layoutContext += 'Animations: ' + layout.css.allAnimations.map(a => a.name).join(', ') + '\n';
    }
    if (layout.css && layout.css.allGlows && layout.css.allGlows.length) {
      layoutContext += 'Glow Patterns: ' + layout.css.allGlows.length + ' unique\n';
    }
  }

  let kbContext = '';
  if (kb) {
    kbContext = '\n\nYOUR KNOWLEDGEBASE:\n';
    if (kb.preferences) {
      kbContext += Object.keys(kb.preferences).map(k => '- ' + k + ': ' + kb.preferences[k]).join('\n') + '\n';
    }
    if (kb.rules && kb.rules.never && kb.rules.never.length) {
      kbContext += '\nNEVER:\n' + kb.rules.never.map(r => '- ' + r).join('\n') + '\n';
    }
    if (kb.rules && kb.rules.always && kb.rules.always.length) {
      kbContext += '\nALWAYS:\n' + kb.rules.always.map(r => '- ' + r).join('\n') + '\n';
    }
  }

  return 'You are JARVIS, the holographic AI assistant embedded in Freedom OS — a vanilla JS SPA built by a teen entrepreneur.\n\n' +
    'BRAND IDENTITY:\n' +
    '- Colors: Primary #00d4aa (teal), Accent #7c3aed (purple), Background #08090f\n' +
    '- Typography: Inter for UI, JetBrains Mono for data/code\n' +
    '- Visual: Dark space aesthetic, radial-gradient glows (NOT box-shadow), glassmorphism\n' +
    '- Rules: Vanilla JS only. ES6 modules. CSS custom properties. Mobile-first.\n\n' +
    'FREEDOM OS STATE SCHEMA (you can suggest logging to these):\n' +
    '- wins[]: {id, title, category, date, description}. Categories: Revenue, Viral, Milestone, Personal, Launch, Other\n' +
    '- dayLog.logs[]: {date, whatILearned, ideas, wins, notes, tomorrowsFocus}\n' +
    '- projects[]: {id, name, status, hypothesis, created}\n' +
    '- people[]: {id, name, platform, followUpDate, notes}\n' +
    '- dashboard.habits[]: {id, name, category, streak, lastCompleted}\n' +
    '- finance.ledger[]: {id, type, amount, date, note}\n\n' +
    'If the user describes a win, lesson, idea, contact, or project, include a log_suggestion in your response.\n\n' +
    layoutContext +
    kbContext +
    '\n\nRESPONSE FORMAT (strict JSON):\n' +
    '{\n' +
    '  "message": "Your explanation...",\n' +
    '  "actions": [\n' +
    '    { "type": "show_file", "path": "js/modules/dashboard.js" },\n' +
    '    { "type": "highlight_range", "path": "js/modules/dashboard.js", "startLine": 20, "endLine": 30, "reason": "Refactor this" }\n' +
    '  ],\n' +
    '  "css_suggestions": [\n' +
    '    { "file": "css/components.css", "description": "Add .ambient-glow" }\n' +
    '  ],\n' +
    '  "log_suggestion": {\n' +
    '    "type": "win|learned|project|person",\n' +
    '    "title": "...",\n' +
    '    "category": "Revenue|Viral|Milestone|Personal|Launch|Other",\n' +
    '    "description": "...",\n' +
    '    "whatILearned": "...",\n' +
    '    "name": "...",\n' +
    '    "platform": "..."\n' +
    '  }\n' +
    '}';
}

function buildFileSummary(file) {
  if (!file) return '';
  
  let summary = `FILE: ${file.path} (${file.type}, ${file.lines} lines)\n`;
  
  if (file.moduleName) summary += `  Module: ${file.moduleName}\n`;
  if (file.routeName) summary += `  Route: ${file.routeName}\n`;
  if (file.functions?.length) summary += `  Functions: ${file.functions.slice(0, 8).join(', ')}${file.functions.length > 8 ? '...' : ''}\n`;
  if (file.freedomApis?.length) summary += `  APIs: ${file.freedomApis.slice(0, 6).join(', ')}\n`;
  if (Object.keys(file.constants || {}).length) {
    const consts = Object.entries(file.constants).slice(0, 4);
    summary += `  Constants: ${consts.map(([k,v]) => `${k}=${Array.isArray(v) ? '['+v.slice(0,3).join(',')+']' : v}`).join(', ')}\n`;
  }
  if (file.selectors?.length) summary += `  Selectors: ${file.selectors.slice(0, 5).join(', ')}\n`;
  if (file.events?.length) summary += `  Events: ${file.events.slice(0, 5).join(', ')}\n`;
  if (file.dependencies?.length) summary += `  Deps: ${file.dependencies.slice(0, 4).join(', ')}\n`;
  
  return summary;
}

function getMockResponse(userMessage, currentFile, manifest) {
  const lowerMsg = userMessage.toLowerCase();
  const fileList = manifest?.files || [];

  if (lowerMsg.includes('win') || lowerMsg.includes('made $') || lowerMsg.includes('client') || lowerMsg.includes('sold') || lowerMsg.includes('money')) {
    return {
      message: "🎯 That sounds like a win! I can log this to your Freedom OS wins.\n\n**Detected:** Revenue/Milestone\n**Title:** " + userMessage.substring(0, 60) + "\n\nClick confirm to save it with today's date.",
      actions: [],
      log_suggestion: {
        type: 'win',
        title: userMessage.replace(/^i\s+(just\s+)?(got|landed|made|closed|sold)\s+/i, '').substring(0, 50),
        category: lowerMsg.includes('money') || lowerMsg.includes('$') || lowerMsg.includes('client') ? 'Revenue' : 'Milestone',
        description: userMessage
      },
      css_suggestions: [],
      read_requests: []
    };
  }

  if (lowerMsg.includes('learned') || lowerMsg.includes('read ') || lowerMsg.includes('watched ') || lowerMsg.includes('tutorial') || lowerMsg.includes('course')) {
    return {
      message: "📚 Great learning! I can add this to today's dayLog under 'whatILearned'.",
      actions: [],
      log_suggestion: { type: 'learned', whatILearned: userMessage },
      css_suggestions: [],
      read_requests: []
    };
  }

  if (lowerMsg.includes('met ') || lowerMsg.includes('networking') || lowerMsg.includes('contact')) {
    return {
      message: "🤝 New connection? I can save this to your people list.",
      actions: [],
      log_suggestion: {
        type: 'person',
        name: userMessage.replace(/.*met\s+/, '').split(' ').slice(0, 2).join(' '),
        platform: 'Unknown',
        notes: userMessage
      },
      css_suggestions: [],
      read_requests: []
    };
  }

  if (lowerMsg.includes('what') && lowerMsg.includes('file')) {
    return {
      message: `Your project has ${fileList.length} files:\n\n` +
        `Core (${fileList.filter(f => f.type === 'core').length}): ` + fileList.filter(f => f.type === 'core').map(f => f.moduleName || f.path.split('/').pop()).join(', ') + '\n' +
        `Modules (${fileList.filter(f => f.type === 'feature-module').length}): ` + fileList.filter(f => f.type === 'feature-module').map(f => f.moduleName || f.path.split('/').pop()).join(', ') + '\n' +
        `System (${fileList.filter(f => f.type === 'system-tool').length}): ` + fileList.filter(f => f.type === 'system-tool').map(f => f.moduleName || f.path.split('/').pop()).join(', ') + '\n\n' +
        'Ask me about any specific module by name.',
      actions: [],
      read_requests: [],
      css_suggestions: []
    };
  }

  return {
    message: "I can help with your Freedom OS codebase and log your wins. Try asking me:\n" +
      '- "I just landed a $5k client"\n' +
      '- "Learned about React hooks today"\n' +
      '- "Show me the dashboard module"\n' +
      '- "Optimize finance.js brand compliance"\n' +
      '- "What files are in the kernel?"',
    actions: [],
    read_requests: [],
    css_suggestions: []
  };
}

async function callOllama(messages, model) {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

  const prompt = messages.map(m => {
    if (m.role === 'system') return 'System: ' + m.content + '\n';
    if (m.role === 'user') return 'User: ' + m.content + '\n';
    if (m.role === 'assistant') return 'Assistant: ' + m.content + '\n';
    return '';
  }).join('') + 'Assistant: ';

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: model,
      prompt: prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.2,
        num_predict: 4000
      }
    });

    const req = http.request(ollamaHost + '/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({
            choices: [{ message: { content: parsed.response } }]
          });
        } catch (e) {
          reject(new Error('Ollama parse error: ' + body.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

app.post('/api/jarvis', async (req, res) => {
  const { message, currentFile, manifestVersion } = req.body;
  const sessionId = req.ip || 'default';
  const manifest = loadManifest();

  if (!manifest) {
    return res.status(404).json({ 
      error: 'Manifest not found',
      fix: 'Run: node scanner.js' 
    });
  }

  // Build rich context
  let fileSummaries = '';
  if (manifest.files) {
    // Add current file content if available
    let currentFileContent = '';
    if (currentFile) {
      const currentFileData = manifest.files.find(f => f.path === currentFile);
      if (currentFileData) {
        fileSummaries += 'CURRENT FILE SUMMARY:\n' + buildFileSummary(currentFileData) + '\n';
        
        // Read actual file content (first 2500 chars)
        const fullPath = path.join(PROJECT_ROOT, currentFile);
        if (isPathSafe(fullPath) && fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          currentFileContent = content.substring(0, 2500);
          fileSummaries += 'CURRENT FILE PREVIEW (first 2500 chars):\n```\n' + currentFileContent + '\n```\n\n';
        }
      }
    }

    // Add summaries of related files (same type or dependencies)
    const relatedFiles = manifest.files.filter(f => {
      if (f.path === currentFile) return false;
      if (currentFile && f.dependencies?.includes(currentFile)) return true;
      if (currentFile && f.path.startsWith(path.dirname(currentFile))) return true;
      return false;
    }).slice(0, 5);

    if (relatedFiles.length) {
      fileSummaries += 'RELATED FILES:\n' + relatedFiles.map(buildFileSummary).join('\n') + '\n';
    }

    // Add module index for quick reference
    const modules = manifest.files.filter(f => f.moduleName).slice(0, 15);
    if (modules.length) {
      fileSummaries += 'MODULE INDEX:\n' + modules.map(m => 
        `- ${m.moduleName} (${m.path}, ${m.functions?.length || 0} functions, APIs: ${m.freedomApis?.slice(0, 3).join(', ') || 'none'})`
      ).join('\n') + '\n';
    }
  }

  if (config.provider === 'mock') {
    console.log('MOCK:', message.substring(0, 50));
    const mockResponse = getMockResponse(message, currentFile, manifest);
    mockResponse.manifestVersion = manifestVersion;
    mockResponse.mock = true;
    return res.json(mockResponse);
  }

  try {
    const systemPrompt = buildSystemPrompt();
    
    // Build user content with rich context
    const userContent = fileSummaries + 
      '\nUSER REQUEST: ' + message + 
      '\n\nIf you need to see more of any file, use read_requests. If you need to suggest code changes, use suggest_placement with exact line numbers.';

    // Get conversation memory
    const memory = getMemory(sessionId);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...memory.slice(-6).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent }
    ];

    let completion;

    if (config.provider === 'ollama') {
      completion = await callOllama(messages, config.model);
    } else {
      completion = await openaiClient.chat.completions.create({
        model: config.model,
        messages: messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 4000
      });
    }

    let aiResponse = JSON.parse(completion.choices[0].message.content);

    // Handle read_requests
    if (aiResponse.read_requests && aiResponse.read_requests.length > 0) {
      const fileContents = [];

      for (const request of aiResponse.read_requests.slice(0, 3)) {
        const cleanPath = request.path.replace(/^\.\/|^\//, '');
        const fullPath = path.join(PROJECT_ROOT, cleanPath);

        if (isPathSafe(fullPath) && fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          fileContents.push({
            path: cleanPath,
            content: content.substring(0, 3000),
            fullSize: content.length
          });
        }
      }

      const secondUserContent = 'FILE CONTENTS:\n' + JSON.stringify(fileContents) + '\n\nNow provide your final response with actions.';

      const secondMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(1), // Skip system, include previous
        { role: 'assistant', content: JSON.stringify({ read_requests: aiResponse.read_requests }) },
        { role: 'user', content: secondUserContent }
      ];

      let secondCompletion;
      if (config.provider === 'ollama') {
        secondCompletion = await callOllama(secondMessages, config.model);
      } else {
        secondCompletion = await openaiClient.chat.completions.create({
          model: config.model,
          messages: secondMessages,
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 4000
        });
      }

      aiResponse = JSON.parse(secondCompletion.choices[0].message.content);
    }

    // Store in memory
    addToMemory(sessionId, 'user', message);
    addToMemory(sessionId, 'assistant', aiResponse.message || '');

    aiResponse.manifestVersion = manifestVersion;
    aiResponse.mock = false;
    aiResponse._provider = config.provider;
    aiResponse._model = config.model;
    res.json(aiResponse);

  } catch (error) {
    console.error('AI Error:', error.message);
    res.status(500).json({ 
      error: 'AI processing failed',
      details: error.message,
      provider: config.provider
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    provider: config.provider,
    model: config.model,
    aiConnected: config.provider !== 'mock' && config.provider !== 'ollama' ? !!openaiClient : true,
    manifest: !!loadManifest(),
    layout: !!loadLayout(),
    knowledgebase: !!loadKnowledgebase()
  });
  app.get('/api/layout', (req, res) => {
  const layout = loadLayout();
  if (!layout) return res.status(404).json({ error: 'Layout not found', fix: 'Run: node scanner.js' });
  res.json(layout);
});
});

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     JARVIS CODE ASSISTANT v1.0         ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║  Server: http://localhost:' + PORT + '          ║');
  console.log('║  Mode:   ' + (config.provider === 'mock' ? 'MOCK (no API)' : config.provider.toUpperCase()).padEnd(24) + ' ║');
  console.log('╚════════════════════════════════════════╝');

  if (!loadManifest()) {
    console.log('\n⚠ No manifest found. Run: node scanner.js');
  } else {
    console.log('✅ Manifest loaded');
  }

  if (!loadLayout()) {
    console.log('⚠ No layout map found. Run: node layout-scanner.js');
  } else {
    console.log('✅ Layout map loaded');
  }

  if (!loadKnowledgebase()) {
    console.log('⚠ No knowledgebase found. Create: jarvis-kb.json');
  } else {
    console.log('✅ Knowledgebase loaded');
  }

  console.log('\n👉 Open: http://localhost:' + PORT + '/jarvis.html\n');
});