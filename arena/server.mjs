// Steelman Arena — local server.
// Serves public/arena.html and streams Claude completions to it over SSE.
//
//   npm start            (reads arena/.env if present)
//   ARENA_MODEL=claude-opus-5-5 ARENA_QUICK_MODEL=claude-haiku-5-5 PORT=4321
//
// The page sends {system, prompt, tier, effort, maxTokens}; the server answers
// with "data: {...}\n\n" events: {delta}, then {done, truncated}, or {error, code}.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4321);
const MODEL = process.env.ARENA_MODEL || 'claude-opus-5-5';
const QUICK_MODEL = process.env.ARENA_QUICK_MODEL || 'claude-haiku-5-5';
const FALLBACKS = (process.env.ARENA_FALLBACKS || 'on') !== 'off';
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

const client = new Anthropic();

function page() {
  const body = fs.readFileSync(path.join(here, 'public', 'arena.html'), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function sse(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  return (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function errorCode(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'auth';
  if (err instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (err instanceof Anthropic.BadRequestError) return 'invalid_request';
  if (err instanceof Anthropic.APIConnectionError) return 'upstream_error';
  if (err instanceof Anthropic.APIError) return 'upstream_error';
  if (err && err.name === 'AbortError') return 'cancelled';
  if (err && /authentication method|api key|x-api-key/i.test(String(err.message))) return 'auth';
  return 'upstream_error';
}

async function complete(req, res) {
  let body;
  try { body = await readJSON(req); } catch { res.writeHead(400).end('Bad JSON'); return; }
  const prompt = String(body.prompt || '');
  if (!prompt.trim()) { res.writeHead(400).end('Missing prompt'); return; }
  const system = body.system ? String(body.system) : undefined;
  const tier = body.tier === 'quick' ? 'quick' : body.tier === 'complex' ? 'complex' : 'default';
  const model = tier === 'quick' ? QUICK_MODEL : MODEL;
  const effort = EFFORTS.has(body.effort) ? body.effort : tier === 'quick' ? 'low' : tier === 'complex' ? 'high' : 'medium';
  const max_tokens = Math.min(16000, Math.max(512, Number(body.maxTokens) || 6000));

  const send = sse(res);
  const ac = new AbortController();
  req.on('close', () => ac.abort());

  const params = {
    model, max_tokens, system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort },
  };
  const useFallback = FALLBACKS && !model.startsWith('claude-haiku');

  try {
    const stream = useFallback
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal: ac.signal })
      : client.messages.stream(params, { signal: ac.signal });
    stream.on('text', (delta) => send({ delta }));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') { send({ error: 'Claude declined this request.', code: 'refused' }); }
    else send({ done: true, truncated: final.stop_reason === 'max_tokens', model: final.model, usage: final.usage });
  } catch (err) {
    if (!ac.signal.aborted) {
      const code = errorCode(err);
      console.error(`[arena] ${code}:`, err && err.message ? err.message : err);
      try { send({ error: err && err.message ? err.message : String(err), code }); } catch {}
    }
  } finally {
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
  } else if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, model: MODEL, quick: QUICK_MODEL, fallbacks: useFallbackLabel() }));
  } else if (req.method === 'POST' && url.pathname === '/api/complete') {
    await complete(req, res);
  } else if (url.pathname === '/favicon.ico') {
    res.writeHead(204).end();
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

function useFallbackLabel() { return FALLBACKS ? 'default' : 'off'; }

server.listen(PORT, () => {
  console.log(`Steelman Arena  →  http://localhost:${PORT}`);
  console.log(`model: ${MODEL}   quick tier: ${QUICK_MODEL}   refusal fallbacks: ${useFallbackLabel()}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log('No ANTHROPIC_API_KEY in the environment; the SDK will look for an `ant auth login` profile.');
  }
});
