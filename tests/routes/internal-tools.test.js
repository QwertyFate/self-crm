// ROUTE tests for the internal team's tools (internal-tools/index.js, INTERNAL_TOOLS_CHANGES Parts 1, 3 and 4, 2026-10-21).
// NOT PART OF THE CRM: a separate little app that server.js mounts at one fixed secret path, before the CRM's session.
// The password is the ADMIN_SECRET's value, sent with every API request (X-Tools-Secret); it is not the admin
// console's login and opens nothing else. No settings and no database (Part 4): the Notetaker is at localhost:8000
// without a token unless INTERNAL_TOOLS_TRANSCRIBE_URL / _TOKEN say otherwise; the audio is held in memory and passed on.
// Pinned: the page and its files only under the path, nothing else there (never the CRM), none of it in public/; the
// password (missing, wrong, the console's header not accepted, off without ADMIN_SECRET, wrong ones limited); where the
// Notetaker is (default, the two .env lines, never the CRM's NOTETAKER_*); a transcription: the file under "file" with
// its name, the language, the answer cut to what the page needs, every refusal mapped, the 100 MB cap, one at a time;
// the settings gone; the wiring.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { serve, ROOT } = require('../helpers/load-route');

const BASE = '/s3cret';
const H = { 'X-Tools-Secret': 'top-secret' };
const ENV = ['ADMIN_SECRET', 'INTERNAL_TOOLS_TRANSCRIBE_URL', 'INTERNAL_TOOLS_TRANSCRIBE_TOKEN', 'NOTETAKER_URL', 'NOTETAKER_CRM_TOKEN'];
const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const MOD = path.join(ROOT, 'internal-tools', 'index.js');
const fresh = () => { delete require.cache[MOD]; return require(MOD); };   // a new router: a new wrong-password count
let srv, sent, answer, hold;

before(async () => { srv = await serve({ [BASE]: fresh() }); });
after(async () => {
  globalThis.fetch = realFetch;
  await srv.close();
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
});
beforeEach(() => {
  process.env.ADMIN_SECRET = 'top-secret';
  for (const k of ENV.slice(1)) delete process.env[k];
  sent = []; hold = null;
  answer = { status: 200, body: { filename: 'call.mp3', language: 'de', duration_seconds: 61.2, seconds_taken: 27.5, model: 'large-v3', text: 'Hallo.\nTschüss.', segments: [{ start: 0, end: 1.5, text: 'Hallo.' }, { start: 59, end: 61.2, text: 'Tschüss.' }] } };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    const call = { url: u, init };
    if (init.body instanceof FormData) { const f = init.body.get('file'); call.file = { name: f.name, type: f.type, text: await f.text() }; }
    sent.push(call);
    if (hold) await hold;
    if (answer.throw) throw answer.throw;
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
  };
});

const call = (method, p, h = H) => srv.request(method, BASE + p, undefined, h);
async function upload({ name = 'call.mp3', bytes = 'ID3 fake mp3 bytes', type = 'audio/mpeg', language, headers = H, noFile = false } = {}) {
  const form = new FormData();
  if (!noFile) form.append('file', new Blob([bytes], { type }), name);
  if (language !== undefined) form.append('language', language);
  const res = await realFetch(srv.base + BASE + '/api/transcribe', { method: 'POST', body: form, headers });
  let body = null; try { body = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body };
}

describe('the page lives only under the secret path, and nothing else does', () => {
  test('without the trailing slash it redirects; with it the page; its two files next to it; never cached', async () => {
    let r = await realFetch(srv.base + BASE, { redirect: 'manual' });
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), BASE + '/');
    r = await realFetch(srv.base + BASE + '/');
    assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(await r.text(), /<html lang="de" class="it-root">/);
    for (const [f, type] of [['tools.css', /text\/css/], ['tools.js', /javascript/]]) {
      r = await realFetch(srv.base + BASE + '/' + f);
      assert.equal(r.status, 200, f); assert.match(r.headers.get('content-type'), type);
    }
  });
  test('anything else under the path is a 404 from the tool itself, never handed on to the CRM', async () => {
    const after = [];
    const own = await serve({ [BASE]: fresh(), '/': (req, res) => { after.push(req.originalUrl); res.status(299).end(); } });
    try {
      assert.equal((await realFetch(own.base + BASE + '/nothing')).status, 404);
      assert.equal((await realFetch(own.base + BASE + '/api/nothing', { headers: H })).status, 404);
      assert.deepEqual(after, [], 'nothing reached what comes after the tool');
    } finally { await own.close(); }
  });
  test('none of its files are in public/, so nothing of it exists outside the path', () => {
    for (const f of ['public/internal-tools.html', 'public/internal-tools.css', 'public/js/internal-tools.js', 'routes/internal-tools.js']) assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} gone`);
  });
});

describe('the password: the ADMIN_SECRET\'s value with every request, nothing else', () => {
  test('missing or wrong (the admin console\'s header too): 401 on every API route, nothing sent', async () => {
    for (const h of [{}, { 'X-Tools-Secret': 'nope' }, { 'X-Admin-Secret': 'top-secret' }]) {
      assert.equal((await call('POST', '/api/unlock', h)).status, 401, JSON.stringify(h));
      assert.equal((await upload({ headers: h })).status, 401);
    }
    assert.equal(sent.length, 0);
  });
  test('right: unlock answers 204', async () => {
    assert.equal((await realFetch(srv.base + BASE + '/api/unlock', { method: 'POST', headers: H })).status, 204);
  });
  test('ADMIN_SECRET not set on the server: 503, the tools are off', async () => {
    delete process.env.ADMIN_SECRET;
    assert.equal((await call('POST', '/api/unlock')).status, 503);
  });
  test('wrong passwords are limited: after 20 in a window the next is 429 too_many; right ones never count', async () => {
    const own = await serve({ [BASE]: fresh() });
    try {
      for (let i = 0; i < 25; i++) assert.equal((await own.request('POST', BASE + '/api/unlock', {}, H)).status, 204, 'right ones are not counted');
      for (let i = 0; i < 20; i++) assert.equal((await own.request('POST', BASE + '/api/unlock', {}, { 'X-Tools-Secret': 'x' + i })).status, 401);
      const r = await own.request('POST', BASE + '/api/unlock', {}, { 'X-Tools-Secret': 'again' });
      assert.equal(r.status, 429); assert.deepEqual(r.body, { error: 'too_many' });
    } finally { await own.close(); }
  });
});

describe('no settings (Part 4)', () => {
  test('the settings routes are gone: 404 with the right password', async () => {
    assert.equal((await call('GET', '/api/settings')).status, 404);
    assert.equal((await srv.request('PUT', BASE + '/api/settings', { url: 'http://x' }, H)).status, 404);
    assert.equal((await call('POST', '/api/settings/check')).status, 404);
    assert.equal(sent.length, 0);
  });
  test('the Notetaker: localhost:8000 without a token; the CRM\'s NOTETAKER_* are never read', async () => {
    process.env.NOTETAKER_URL = 'http://10.0.0.5:8000/crm/recordings';
    process.env.NOTETAKER_CRM_TOKEN = 'crm-token';
    await upload();
    assert.equal(sent[0].url, 'http://localhost:8000/crm/transcribe');
    assert.equal(sent[0].init.headers.Authorization, undefined);
  });
  test('only if .env says so: another address and a token', async () => {
    process.env.INTERNAL_TOOLS_TRANSCRIBE_URL = ' http://192.168.1.20:8000/crm/transcribe ';
    process.env.INTERNAL_TOOLS_TRANSCRIBE_TOKEN = ' tok ';
    await upload({ language: 'de' });
    assert.equal(sent[0].url, 'http://192.168.1.20:8000/crm/transcribe?language=de');
    assert.equal(sent[0].init.headers.Authorization, 'Bearer tok');
  });
  test('a broken address in .env: 500 config, nothing sent', async () => {
    process.env.INTERNAL_TOOLS_TRANSCRIBE_URL = 'not a url';
    assert.deepEqual(await upload(), { status: 500, body: { error: 'config' } });
    assert.equal(sent.length, 0);
  });
  test('the old settings file is not read or written', () => {
    const mod = fs.readFileSync(MOD, 'utf8');
    assert.doesNotMatch(mod, /INTERNAL_TOOLS_FILE|internal-tools\.json|require\('fs'\)|writeFile/);
  });
});

describe('a transcription', () => {
  test('the file goes on under "file" with its name and type; JSON is asked for; the answer is cut to what the page shows', async () => {
    const r = await upload();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { filename: 'call.mp3', language: 'de', duration_seconds: 61.2, seconds_taken: 27.5, text: 'Hallo.\nTschüss.', segments: [{ start: 0, end: 1.5, text: 'Hallo.' }, { start: 59, end: 61.2, text: 'Tschüss.' }] });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].init.method, 'POST');
    assert.deepEqual(sent[0].file, { name: 'call.mp3', type: 'audio/mpeg', text: 'ID3 fake mp3 bytes' });
  });
  test('a German file name arrives as it was written', async () => {
    await upload({ name: 'Gespräch Müller.m4a', type: 'audio/mp4' });
    assert.equal(sent[0].file.name, 'Gespräch Müller.m4a');
  });
  test('the language: none or empty means detect it; a code is passed on; anything else is refused', async () => {
    await upload(); await upload({ language: '' }); await upload({ language: 'en' });
    assert.deepEqual(sent.map(s => s.url), ['http://localhost:8000/crm/transcribe', 'http://localhost:8000/crm/transcribe', 'http://localhost:8000/crm/transcribe?language=en']);
    assert.deepEqual(await upload({ language: 'xx-bad' }), { status: 400, body: { error: 'language' } });
    assert.equal(sent.length, 3);
  });
  test('no file, an empty file, or one over 100 MB: refused here, nothing sent', async () => {
    assert.deepEqual(await upload({ noFile: true }), { status: 400, body: { error: 'no_file' } });
    assert.deepEqual(await upload({ bytes: '' }), { status: 400, body: { error: 'empty' } });
    assert.deepEqual(await upload({ bytes: Buffer.alloc(100 * 1024 * 1024 + 1) }), { status: 413, body: { error: 'too_large', maxMb: 100 } });
    assert.equal(sent.length, 0);
  });
  test('the Notetaker\'s refusals: wrong token, unreadable audio, too large, its own error, unreachable, too slow', async () => {
    const cases = [
      [{ status: 401, body: { detail: 'missing or wrong Authorization: Bearer token' } }, 502, { error: 'token' }],
      [{ status: 422, body: { detail: 'could not decode the audio' } }, 422, { error: 'unreadable', detail: 'could not decode the audio' }],
      [{ status: 413, body: { detail: 'file is larger than 500 MB' } }, 413, { error: 'too_large', maxMb: 100 }],
      [{ status: 500, body: { detail: 'transcription failed; see the server log' } }, 502, { error: 'notetaker', status: 500 }],
      [{ throw: new TypeError('fetch failed') }, 502, { error: 'unreachable' }],
      [{ throw: Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) }, 504, { error: 'timeout' }],
    ];
    for (const [a, status, body] of cases) {
      answer = a;
      assert.deepEqual(await upload(), { status, body }, JSON.stringify(a));
    }
  });
  test('one at a time: a second file while one is running is refused (the Notetaker\'s machine runs one Whisper)', async () => {
    let release; hold = new Promise(r => { release = r; });
    const first = upload();
    for (let i = 0; !sent.length; i++) { assert.ok(i < 400, 'the first file reached the Notetaker'); await new Promise(r => setTimeout(r, 5)); }
    assert.deepEqual(await upload(), { status: 429, body: { error: 'busy' } });
    release();
    assert.equal((await first).status, 200);
    hold = null;
    assert.equal((await upload()).status, 200, 'free again afterwards');
  });
});

describe('wiring: separate from the CRM', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const mod = fs.readFileSync(MOD, 'utf8');
  test('server.js mounts it once at a fixed secret path, before the CRM\'s session and the catch-all; no /internal-tools route left', () => {
    assert.match(server, /^const INTERNAL_TOOLS_PATH = '\/[0-9a-f]{24}';$/m, 'a fixed path of 24 random hex characters');
    assert.match(server, /^app\.use\(INTERNAL_TOOLS_PATH, require\('\.\/internal-tools'\)\);$/m);
    const at = server.indexOf('app.use(INTERNAL_TOOLS_PATH');
    assert.ok(at < server.indexOf('app.use(sessionMiddleware);'), 'before the session: it never touches the CRM\'s sessions');
    assert.ok(at > server.indexOf('app.use(express.json());'), 'after the JSON body parser');
    assert.ok(at < server.indexOf("app.get('*'"));
    assert.doesNotMatch(server, /'\/internal-tools'|\/api\/internal-tools|routes\/internal-tools/);
  });
  test('it uses nothing of the CRM: no database, no login, no admin console, no Notetaker integration, no CRM styles', () => {
    assert.doesNotMatch(mod, /require\('\.\.\/(db|middleware|utils|routes|notifications|storage)/);
    const page = ['index.html', 'tools.css', 'tools.js'].map(f => fs.readFileSync(path.join(ROOT, 'internal-tools', 'page', f), 'utf8')).join('\n');
    assert.doesNotMatch(page, /style\.css|\/api\/admin|\/fonts\/|\/images\/|href="\/"/);
  });
  test('.env.example names the two optional lines; nothing about a settings file is left', () => {
    const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    assert.match(env, /^# INTERNAL_TOOLS_TRANSCRIBE_URL=http:\/\/localhost:8000\/crm\/transcribe$/m);
    assert.match(env, /^# INTERNAL_TOOLS_TRANSCRIBE_TOKEN=$/m);
    assert.doesNotMatch(env + fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /INTERNAL_TOOLS_FILE|internal-tools\.json/);
  });
});
