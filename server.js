// server.js
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
// Generate a key: node -e "console.log('orix_' + require('crypto').randomBytes(24).toString('hex'))"
const DEPLOY_KEY = process.env.ORIX_DEPLOY_KEY || 'orix_change_me_in_production';
const PORT       = process.env.PORT || 8787;
const HOST       = process.env.HOST || '0.0.0.0';

// Optional: upstream AI provider (OpenAI-compatible)
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL    = process.env.OPENAI_MODEL    || 'gpt-4o-mini';

const SYSTEM_PROMPT = process.env.ORIX_SYSTEM_PROMPT
  || 'You are ORIX, a concise, helpful AI assistant.';

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // needed if behind Cloudflare / nginx / Render

app.use(cors({
  origin: '*', // tighten to your GitHub Pages URL in production:
               // origin: 'https://zamorabhai-byte.github.io'
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));

// Serve static files from ./public (put index.html here for same-origin serving)
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireKey(req, res, next) {
  const header = req.get('authorization') || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Missing deploy key' });
  }
  if (!safeEqual(token, DEPLOY_KEY)) {
    return res.status(403).json({ error: 'Invalid deploy key' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
// Rate limiting (per IP)
// ─────────────────────────────────────────────────────────────
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

// Public health check — no auth needed
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'orix',
    model: OPENAI_API_KEY ? OPENAI_MODEL : 'echo',
    time: new Date().toISOString(),
  });
});

// Key check — used by the "Test key" button in Settings
app.get('/api/auth/check', requireKey, (req, res) => {
  res.json({ ok: true });
});

// Main chat endpoint
app.post('/api/chat', chatLimiter, requireKey, async (req, res) => {
  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages must be an array' });
    }
    if (messages.length === 0) {
      return res.status(400).json({ error: 'messages cannot be empty' });
    }
    if (messages.length > 100) {
      return res.status(400).json({ error: 'too many messages' });
    }

    // Sanitize: only allow role + content
    const clean = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));

    if (clean.length === 0) {
      return res.status(400).json({ error: 'no valid messages' });
    }

    // ── Echo mode (no upstream key configured) ───────────────
    if (!OPENAI_API_KEY) {
      const lastUser = [...clean].reverse().find(m => m.role === 'user');
      return res.json({
        text: `[echo] ORIX received: "${lastUser?.content ?? ''}"`,
      });
    }

    // ── Upstream AI call (OpenAI-compatible) ─────────────────
    const upstream = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...clean],
        temperature: 0.7,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('[ORIX] upstream error', upstream.status, detail.slice(0, 300));
      return res.status(502).json({ error: `Upstream error (${upstream.status})` });
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(502).json({ error: 'Empty response from model' });
    }

    res.json({ text });
  } catch (err) {
    console.error('[ORIX] chat error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fallback: SPA-style — serve index.html for unknown GETs
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) next();
  });
});

// 404 for anything else
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ORIX server running');
  console.log(`  → http://${HOST}:${PORT}`);
  console.log(`  → Model: ${OPENAI_API_KEY ? OPENAI_MODEL : 'echo (no OPENAI_API_KEY)'}`);
  console.log(`  → Deploy key: ${DEPLOY_KEY.slice(0, 10)}…`);
  if (DEPLOY_KEY === 'orix_change_me_in_production') {
    console.log('');
    console.log('  ⚠  WARNING: using default deploy key. Set ORIX_DEPLOY_KEY.');
  }
  console.log('');
});
