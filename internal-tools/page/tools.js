'use strict';
// The internal team's tools (internal-tools/, INTERNAL_TOOLS_CHANGES Parts 2–4, 2026-10-21). Not part of the CRM: served
// only under a fixed secret path, every call relative to it ('api/…'). The password (the ADMIN_SECRET's value) is kept
// in this tab's memory only and sent with every request as X-Tools-Secret; reloading asks again. One screen: an audio
// file goes to the Notetaker through api/transcribe, the transcript comes back (plain or with timestamps, copy, .txt
// download). No settings (Part 4): the server knows where the Notetaker is.
// Words: IT_I18N, German first. Nothing from the server or a file name is written as HTML (textContent only).

const IT_I18N = {
  de: {
    it_title: 'Interne Tools',
    it_lang: 'Sprache',
    it_lock: 'Sperren',
    it_gate_d: 'Nur für das Team. Das Passwort ist das Admin-Secret.',
    it_pass: 'Passwort',
    it_unlock: 'Entsperren',
    it_tr_t: 'Audio transkribieren',
    it_drop: 'Audiodatei auswählen oder hierher ziehen',
    it_drop_d: 'MP3, WAV, M4A, OGG, FLAC oder ein Video, bis etwa fünf Minuten.',
    it_chosen: '{name} ({mb} MB)',
    it_lang_auto: 'Automatisch erkennen',
    it_lang_de: 'Deutsch',
    it_lang_en: 'Englisch',
    it_tr_go: 'Transkribieren starten',
    it_need_file: 'Bitte zuerst eine Datei auswählen.',
    it_working: 'Wird transkribiert … {t}',
    it_done: 'Fertig.',
    it_meta: '{lang}, {dur} Audio, in {secs} Sekunden transkribiert',
    it_view: 'Ansicht',
    it_plain: 'Nur Text',
    it_times: 'Mit Zeitmarken',
    it_copy: 'Kopieren',
    it_copied: 'Kopiert.',
    it_copy_fail: 'Kopieren geht hier nicht. Den Text markieren und mit Strg+C kopieren.',
    it_download: 'Als .txt herunterladen',
    it_txt_name: 'transkript',
    it_err_wrong: 'Falsches Passwort.',
    it_err_off: 'ADMIN_SECRET ist auf diesem Server nicht gesetzt.',
    it_err_expired: 'Das Passwort gilt nicht mehr. Bitte erneut entsperren.',
    it_err_too_many: 'Zu viele falsche Versuche. Bitte in 15 Minuten erneut.',
    it_err_empty: 'Die Datei ist leer.',
    it_err_too_large: 'Die Datei ist größer als {mb} MB.',
    it_err_busy: 'Gerade läuft schon eine Transkription. Bitte kurz warten.',
    it_err_token: 'Der Notetaker verlangt einen Token, der hier fehlt oder nicht passt.',
    it_err_unreadable: 'Der Notetaker konnte die Datei nicht lesen: {detail}',
    it_err_notetaker: 'Der Notetaker meldet einen Fehler ({status}).',
    it_err_unreachable: 'Der Notetaker ist nicht erreichbar. Läuft er?',
    it_err_timeout: 'Nach fünf Minuten kam keine Antwort. Das Tool ist für kurze Aufnahmen gedacht.',
    it_err_any: 'Das hat nicht geklappt. Bitte erneut versuchen.',
  },
  en: {
    it_title: 'Internal tools',
    it_lang: 'Language',
    it_lock: 'Lock',
    it_gate_d: 'For the team only. The password is the admin secret.',
    it_pass: 'Password',
    it_unlock: 'Unlock',
    it_tr_t: 'Transcribe audio',
    it_drop: 'Choose an audio file or drop it here',
    it_drop_d: 'MP3, WAV, M4A, OGG, FLAC or a video, up to about five minutes.',
    it_chosen: '{name} ({mb} MB)',
    it_lang_auto: 'Detect automatically',
    it_lang_de: 'German',
    it_lang_en: 'English',
    it_tr_go: 'Start transcribing',
    it_need_file: 'Choose a file first.',
    it_working: 'Transcribing… {t}',
    it_done: 'Done.',
    it_meta: '{lang}, {dur} of audio, transcribed in {secs} seconds',
    it_view: 'View',
    it_plain: 'Plain text',
    it_times: 'With timestamps',
    it_copy: 'Copy',
    it_copied: 'Copied.',
    it_copy_fail: 'Copying is blocked here. Select the text and press Ctrl+C.',
    it_download: 'Download as .txt',
    it_txt_name: 'transcript',
    it_err_wrong: 'Wrong password.',
    it_err_off: 'ADMIN_SECRET is not set on this server.',
    it_err_expired: 'The password is no longer valid. Unlock again.',
    it_err_too_many: 'Too many wrong attempts. Try again in 15 minutes.',
    it_err_empty: 'The file is empty.',
    it_err_too_large: 'The file is larger than {mb} MB.',
    it_err_busy: 'A transcription is already running. Wait a moment.',
    it_err_token: 'The Notetaker requires a token that is missing or wrong here.',
    it_err_unreadable: 'The Notetaker could not read the file: {detail}',
    it_err_notetaker: 'The Notetaker reports an error ({status}).',
    it_err_unreachable: 'The Notetaker cannot be reached. Is it running?',
    it_err_timeout: 'No answer after five minutes. The tool is meant for short recordings.',
    it_err_any: 'That did not work. Try again.',
  },
};

let itLang = 'de';
const IT_LANG_KEY = 'internal-tools-lang';   // its own memory, not the CRM's

// ── words and the pure helpers ─────────────────────────────────────────────────────────────────────────────────────
function itWord(k) { return (IT_I18N[itLang] || IT_I18N.de)[k] ?? IT_I18N.de[k] ?? k; }
function itFill(s, v) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)); }
function itClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = n => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
// The transcript as it came, or one line per segment with its start time.
function itTranscript(r, times) {
  if (!times || !r.segments || !r.segments.length) return r.text;
  return r.segments.map(s => `[${itClock(s.start)}] ${s.text}`).join('\n');
}
// The download's name: the audio's name with .txt, no path characters; a fallback when there is none.
function itTxtName(name) {
  const base = String(name || '').replace(/\.[^./\\]{1,10}$/, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || itWord('it_txt_name')) + '.txt';
}
function itMb(bytes) { return new Intl.NumberFormat(itLang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024)); }
function itMeta(r) {
  const lang = r.language === 'de' ? itWord('it_lang_de') : r.language === 'en' ? itWord('it_lang_en') : String(r.language || '?').toUpperCase();
  return itFill(itWord('it_meta'), { lang, dur: itClock(r.duration_seconds), secs: Math.round(Number(r.seconds_taken) || 0) });
}
// One sentence for every answer the server can give; a wrong password, the tools off or too many tries lock the page.
function itError(status, body) {
  if (status === 401) return { text: itWord('it_err_expired'), gate: true };
  if (status === 503) return { text: itWord('it_err_off'), gate: true };
  if (status === 429 && body && body.error === 'too_many') return { text: itWord('it_err_too_many'), gate: true };
  const b = body || {};
  const key = { no_file: 'it_need_file', empty: 'it_err_empty', too_large: 'it_err_too_large', busy: 'it_err_busy', token: 'it_err_token', unreadable: 'it_err_unreadable', notetaker: 'it_err_notetaker', unreachable: 'it_err_unreachable', timeout: 'it_err_timeout' }[b.error];
  return { text: key ? itFill(itWord(key), { mb: b.maxMb, detail: b.detail, status: b.status }) : itWord('it_err_any'), gate: false };
}

// ── the page ───────────────────────────────────────────────────────────────────────────────────────────────────────
let itSecret = '';       // the password, in this tab's memory only
let itFile = null;       // the chosen audio file
let itResult = null;     // the last transcript
let itTimes = false;     // show it with timestamps
let itTimer = null;      // the elapsed time while a file is being transcribed

// Every call is relative to the page's secret path and carries the password.
async function itApi(method, url, secret = itSecret) {
  try {
    const r = await fetch(url, { method, headers: { 'X-Tools-Secret': secret } });
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    return { status: r.status, ok: r.ok, data };
  } catch (e) {
    return { status: 0, ok: false, data: null };
  }
}
function itSay(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.classList.toggle('is-err', kind === 'err');
  el.classList.toggle('is-ok', kind === 'ok');
}
function itFail(id, status, data) {
  const e = itError(status, data);
  if (e.gate) return itShowGate(e.text);
  itSay(id, e.text, 'err');
}

function itSetLang(l, save) {
  itLang = l === 'en' ? 'en' : 'de';
  document.documentElement.lang = itLang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = itWord(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', itWord(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === itLang)));
  document.title = itWord('it_title');
  if (save) { try { localStorage.setItem(IT_LANG_KEY, itLang); } catch (e) { /* private mode */ } }
  itShowFile();
  itShowResult();
}

// ── locked / unlocked ──
function itShowGate(message) {
  itSecret = '';
  document.getElementById('it-tools').hidden = true;
  document.getElementById('it-lock').hidden = true;
  document.getElementById('it-gate').hidden = false;
  const err = document.getElementById('it-gate-err');
  err.textContent = message || '';
  err.hidden = !message;
  document.getElementById('it-pass').focus();
}
function itShowTools() {
  document.getElementById('it-gate').hidden = true;
  document.getElementById('it-tools').hidden = false;
  document.getElementById('it-lock').hidden = false;
  document.getElementById('it-file').focus();
}
async function itUnlock(e) {
  e.preventDefault();
  const secret = document.getElementById('it-pass').value;
  if (!secret) return document.getElementById('it-pass').focus();
  const go = document.getElementById('it-gate-go');
  go.disabled = true;
  const r = await itApi('POST', 'api/unlock', secret);
  go.disabled = false;
  document.getElementById('it-pass').value = '';
  if (r.ok) { itSecret = secret; return itShowTools(); }
  itShowGate(itWord(r.status === 401 ? 'it_err_wrong' : r.status === 503 ? 'it_err_off' : r.status === 429 ? 'it_err_too_many' : 'it_err_any'));
}
function itLockNow() {
  itShowGate('');
}

// ── transcribe ──
function itShowFile() {
  const t = document.getElementById('it-drop-t');
  document.getElementById('it-drop').classList.toggle('has-file', !!itFile);
  t.textContent = itFile ? itFill(itWord('it_chosen'), { name: itFile.name, mb: itMb(itFile.size) }) : itWord('it_drop');
}
function itPick(file) {
  itFile = file || null;
  itShowFile();
  itSay('it-tr-status', '');
}
async function itTranscribe(e) {
  e.preventDefault();
  if (itTimer) return;
  if (!itFile) return itSay('it-tr-status', itWord('it_need_file'), 'err');
  const form = new FormData();
  form.append('file', itFile, itFile.name);
  const lang = document.getElementById('it-tr-lang').value;
  if (lang) form.append('language', lang);
  const go = document.getElementById('it-tr-go'), started = Date.now();
  const tick = () => itSay('it-tr-status', itFill(itWord('it_working'), { t: itClock((Date.now() - started) / 1000) }));
  go.disabled = true;
  tick();
  itTimer = setInterval(tick, 1000);
  let status = 0, data = null;
  try {
    const r = await fetch('api/transcribe', { method: 'POST', body: form, headers: { 'X-Tools-Secret': itSecret } });
    status = r.status;
    try { data = await r.json(); } catch (err) { /* not JSON */ }
  } catch (err) { status = 0; }
  clearInterval(itTimer);
  itTimer = null;
  go.disabled = false;
  if (status !== 200 || !data || typeof data.text !== 'string') return itFail('it-tr-status', status, data);
  itSay('it-tr-status', itWord('it_done'), 'ok');
  itResult = data;
  itShowResult();
  document.getElementById('it-result').hidden = false;
  document.getElementById('it-result-t').focus();
}
function itShowResult() {
  if (!itResult) return;
  document.getElementById('it-result-t').textContent = itResult.filename || itWord('it_txt_name');
  document.getElementById('it-result-meta').textContent = itMeta(itResult);
  document.getElementById('it-out').textContent = itTranscript(itResult, itTimes);
  document.querySelectorAll('[data-times]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.times === '1') === itTimes)));
}
async function itCopy() {
  try {
    await navigator.clipboard.writeText(itTranscript(itResult, itTimes));
    itSay('it-result-status', itWord('it_copied'), 'ok');
  } catch (e) {
    itSay('it-result-status', itWord('it_copy_fail'), 'err');
  }
}
function itDownload() {
  const url = URL.createObjectURL(new Blob([itTranscript(itResult, itTimes) + '\n'], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = itTxtName(itResult.filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function itInit() {
  let lang = 'de';
  try { const l = localStorage.getItem(IT_LANG_KEY); if (l === 'en' || l === 'de') lang = l; } catch (e) { /* private mode */ }
  itSetLang(lang, false);
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => itSetLang(b.dataset.lang, true)));

  document.getElementById('it-gate-form').addEventListener('submit', itUnlock);
  document.getElementById('it-lock').addEventListener('click', itLockNow);

  const drop = document.getElementById('it-drop');
  document.getElementById('it-file').addEventListener('change', e => itPick(e.target.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files.length) itPick(e.dataTransfer.files[0]); });
  document.getElementById('it-tr-form').addEventListener('submit', itTranscribe);
  document.querySelectorAll('[data-times]').forEach(b => b.addEventListener('click', () => { itTimes = b.dataset.times === '1'; itShowResult(); }));
  document.getElementById('it-copy').addEventListener('click', itCopy);
  document.getElementById('it-save').addEventListener('click', itDownload);

  itShowGate('');
}

document.addEventListener('DOMContentLoaded', itInit);
