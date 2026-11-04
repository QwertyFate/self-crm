/* ═══════════════════════════════════════════════════════════════════════════
   internal-tools/ — small tools for the internal team (INTERNAL_TOOLS_CHANGES).

   NOT PART OF THE CRM. A separate little app that server.js mounts at one
   fixed secret path (INTERNAL_TOOLS_PATH there); nothing links to it and none
   of its files are in public/, so without the path there is nothing to find.
   It uses none of the CRM's sessions, logins, database, settings or styles,
   and nothing under its path ever falls through to the CRM (404).

   THE PASSWORD  the ADMIN_SECRET's value, sent by the page with every API
                 request (X-Tools-Secret) and compared in constant time. It is
                 not the admin console's login and opens nothing else. With
                 ADMIN_SECRET unset the tools are off (503). Wrong passwords
                 are limited per IP.
   TRANSCRIBE    POST api/transcribe (multipart "file", optional "language")
                 → the Notetaker's POST /crm/transcribe, which answers when
                 Whisper is done (about 1 minute per 2.3 minutes of audio).
                 Meant for clips under five minutes: the wait is capped at
                 five, the file at 100 MB. One at a time. The audio is held in
                 memory only. No settings (Part 4): the Notetaker is at
                 localhost:8000 without a token; only if that ever changes,
                 INTERNAL_TOOLS_TRANSCRIBE_URL / _TOKEN in .env.

   GET  /             the page (internal-tools/page/index.html); without the
                      trailing slash it redirects, so the page's relative
                      links stay under the path
   GET  /tools.css, /tools.js
   POST /api/unlock   checks the password, nothing else
   POST /api/transcribe
   ═══════════════════════════════════════════════════════════════════════════ */

const express  = require('express');
const crypto   = require('crypto');
const path     = require('path');
const multer   = require('multer');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();
const PAGE = path.join(__dirname, 'page');
const DEFAULT_URL = 'http://localhost:8000/crm/transcribe';
const MAX_MB = 100;                    // a five-minute clip: about 5 MB as MP3, at most about 50 MB as WAV
const WAIT_MS = 5 * 60 * 1000;         // longer than a five-minute clip takes
const LANG = /^[a-z]{2,3}$/;           // a Whisper language code (de, en, …); none means "detect it"
const noStore = res => res.setHeader('Cache-Control', 'no-store');

// ── the page ──
router.get('/', (req, res) => {
  if (!req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(302, req.originalUrl.split('?')[0] + '/');
  noStore(res);
  res.sendFile(path.join(PAGE, 'index.html'));
});
router.use(express.static(PAGE, { index: false, setHeaders: noStore }));

// ── the password ──
function matches(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const wrongLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  requestWasSuccessful: (req, res) => res.statusCode !== 401,   // only wrong passwords count
  skipSuccessfulRequests: true,
  message: { error: 'too_many' },
});
function gate(req, res, next) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return res.status(503).json({ error: 'off' });
  if (!matches(req.get('X-Tools-Secret'), expected)) return res.status(401).json({ error: 'password' });
  next();
}
const api = express.Router();
api.use(wrongLimit, gate, (req, res, next) => { noStore(res); next(); });
router.use('/api', api);

api.post('/unlock', (req, res) => res.status(204).end());

// ── a transcription ──
// Where the Notetaker is: localhost:8000 without a token, unless .env says otherwise.
function notetaker() {
  return {
    url: String(process.env.INTERNAL_TOOLS_TRANSCRIBE_URL || '').trim() || DEFAULT_URL,
    token: String(process.env.INTERNAL_TOOLS_TRANSCRIBE_TOKEN || '').trim() || null,
  };
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 }, defParamCharset: 'utf8' }).single('file');
let busy = false;
api.post('/transcribe', async (req, res, next) => {
  if (busy) return res.status(429).json({ error: 'busy' });
  busy = true;
  try {
    const failed = await new Promise(resolve => upload(req, res, err => resolve(err || null)));
    if (failed) {
      if (failed.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'too_large', maxMb: MAX_MB });
      return res.status(400).json({ error: failed.code === 'LIMIT_UNEXPECTED_FILE' ? 'no_file' : 'upload' });
    }
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    if (!req.file.size) return res.status(400).json({ error: 'empty' });
    const language = req.body && typeof req.body.language === 'string' ? req.body.language.trim() : '';
    if (language && !LANG.test(language)) return res.status(400).json({ error: 'language' });

    const nt = notetaker();
    let url;
    try { url = new URL(nt.url); } catch { return res.status(500).json({ error: 'config' }); }
    if (language) url.searchParams.set('language', language);
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' }), req.file.originalname || 'audio');
    let r;
    try {
      r = await fetch(url.toString(), { method: 'POST', body: form, headers: nt.token ? { Authorization: `Bearer ${nt.token}` } : {}, signal: AbortSignal.timeout(WAIT_MS) });
    } catch (e) {
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return res.status(504).json({ error: 'timeout' });
      return res.status(502).json({ error: 'unreachable' });
    }
    let body = null;
    try { body = await r.json(); } catch { /* not JSON */ }
    if (r.status === 401) return res.status(502).json({ error: 'token' });
    if (r.status === 413) return res.status(413).json({ error: 'too_large', maxMb: MAX_MB });
    if (r.status === 422) return res.status(422).json({ error: 'unreadable', detail: String(body?.detail ?? '').slice(0, 300) });
    if (!r.ok || !body || typeof body.text !== 'string') return res.status(502).json({ error: 'notetaker', status: r.status });
    res.json({
      filename: req.file.originalname || '',
      language: typeof body.language === 'string' ? body.language : '',
      duration_seconds: Number(body.duration_seconds) || 0,
      seconds_taken: Number(body.seconds_taken) || 0,
      text: body.text,
      segments: (Array.isArray(body.segments) ? body.segments : []).map(s => ({ start: Number(s?.start) || 0, end: Number(s?.end) || 0, text: String(s?.text ?? '') })),
    });
  } catch (e) {
    next(e);
  } finally {
    busy = false;
  }
});

// Nothing else under the secret path: never fall through to the CRM.
api.use((req, res) => res.status(404).json({ error: 'not_found' }));
router.use((req, res) => res.status(404).end());

module.exports = router;
