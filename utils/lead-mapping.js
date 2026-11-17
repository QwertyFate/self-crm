/* ═══════════════════════════════════════════════════════════════════════════
   LEAD MAPPING — how a delivery to a lead webhook becomes a contact's values
   (LEAD_WEBHOOK_CHANGES Parts 3–5). One module, so the receiver, the list of
   a sample's fields on the card and the preview all read a payload the same
   way (routes/integrations.js).

   A webhook's field_map says, per CRM field, WHERE in the delivery its value
   is: { name: 'full_name', email: 'data.contact.email', eigenkapital: … }.
   That "where" is a path:

     full_name                         a key of the delivery
     data.contact.email                a key inside a key inside a key
     items.0.sku   ·   items[0].sku    the first entry of a list
     field_data[name=email].values     the entry of a list of name/value pairs whose
                                       `name` is "email" (case and outer blanks do not
                                       matter) — how Facebook lead ads, HubSpot forms
                                       and many form tools send their answers
     contact[email]                    the same as contact.email (form posts)
     Full Name   ·   contact.email     a key exactly as written, when the delivery has
                                       one with a blank, a dot or brackets in its name

   pick(payload, path)      the value there, or null. A path the old receiver
                            understood (dots only) finds what it always found.
   text(value)              a value as the text a contact field takes: text as it
                            is, numbers and true/false in words, a list of plain
                            values joined with ", "; null for nothing, for an object
                            and for a list of objects (those are not one value).
   flatten(payload)         every value a path can reach, as [{ path, value }] —
                            what the card offers to choose from. A list of
                            name/value pairs is offered by name, any other list of
                            objects by position (its first MAX_LIST entries).
                            For every entry, text(pick(payload, path)) is its value.
   mapPayload(payload, fieldMap)
                            { name, email, phone, company, customData, skipped } —
                            exactly what the receiver has always derived: name falls
                            back to first_name + last_name, anything that is not a
                            built-in field is a custom field, a custom field whose
                            value is missing or empty is listed under skipped.
   asPayload(body)          the request body as an object, whatever was sent: JSON
                            (also sent as text or with no content type), a form
                            post, a multipart form; anything else is kept under
                            raw_body so the card can show what arrived.
   bodyParsers(express)     the middlewares server.js mounts on the receive path so
                            those bodies are read at all (JSON itself stays with the
                            app's own express.json()).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const BUILTIN = new Set(['name', 'first_name', 'last_name', 'email', 'phone', 'company']);
const MAX_DEPTH     = 8;     // how deep flatten() looks
const MAX_FIELDS    = 300;   // how many values it offers
const MAX_LIST      = 25;    // entries of a list it offers by position
const EXAMPLE_CHARS = 120;   // an example value on the card
const BODY_LIMIT    = '100kb';

// What marks a list as name/value pairs: every entry has the same naming key with a different text in it, and a
// key that holds its value. { name: 'Erika', email: … } is a record, not a pair: it has no value key, so a list
// of those is offered by position (a selector on a person's name would only ever match the sample).
const NAME_KEYS  = ['name', 'key', 'label', 'question', 'title', 'field', 'id', 'ref', 'slug'];
const VALUE_KEYS = ['value', 'values', 'answer', 'answers'];

const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isPlain = v => typeof v === 'string' || typeof v === 'boolean' || typeof v === 'bigint' || (typeof v === 'number' && Number.isFinite(v));
const isPlainOrNull = v => v === null || v === undefined || isPlain(v);

function text(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (isPlain(v)) return String(v);
  if (Array.isArray(v)) {
    const parts = v.filter(isPlain).map(String).filter(s => s.trim() !== '');
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

// A path as steps: { key } for a name (bracket: true when it stood in brackets), { field, value } for a selector.
function steps(path) {
  const out = [];
  let cur = '';
  const flush = () => { if (cur !== '') { out.push({ key: cur }); cur = ''; } };
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '.') { flush(); continue; }
    if (ch === '[') {
      const end = path.indexOf(']', i);
      if (end < 0) { cur += path.slice(i); break; }   // no closing bracket: part of the key's name
      flush();
      const inner = path.slice(i + 1, end);
      const eq = inner.indexOf('=');
      if (eq > 0) out.push({ field: inner.slice(0, eq).trim(), value: inner.slice(eq + 1).trim().toLowerCase() });
      else if (inner.trim() !== '') out.push({ key: inner.trim(), bracket: true });
      i = end;
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

// Follow the steps from `node`. A key that is not there is tried once more joined with the next ones by a dot, so a
// delivery whose keys themselves contain dots ("contact.email": …) is found; the nested reading always comes first.
// undefined = nothing there (a JSON null that IS there comes back as null).
function walk(node, list, i) {
  if (i === list.length) return node;
  if (node === null || node === undefined) return undefined;
  const s = list[i];
  if (s.field !== undefined) {
    if (!Array.isArray(node)) return undefined;
    const hit = node.find(el => own(el, s.field) && isPlain(el[s.field]) && String(el[s.field]).trim().toLowerCase() === s.value);
    return hit === undefined ? undefined : walk(hit, list, i + 1);
  }
  let key = s.key;
  for (let j = i; j < list.length; j++) {
    if (j > i) {
      const n = list[j];
      if (n.field !== undefined || n.bracket) break;
      key += '.' + n.key;
    }
    if (own(node, key)) {
      const r = walk(node[key], list, j + 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function pick(payload, path) {
  if (typeof path !== 'string' || payload === null || typeof payload !== 'object') return null;
  const p = path.trim();
  if (!p) return null;
  const found = walk(payload, steps(p), 0);
  if (found !== undefined) return found;
  // a key exactly as written (brackets in its name, or blanks at its ends)
  if (own(payload, path)) return payload[path] ?? null;
  if (own(payload, p)) return payload[p] ?? null;
  return null;
}

// The naming key of a list of name/value pairs, or null when the list is something else.
function pairNameKey(list) {
  if (!list.length || !list.every(x => x !== null && typeof x === 'object' && !Array.isArray(x))) return null;
  if (!list.every(x => VALUE_KEYS.some(k => own(x, k)))) return null;
  for (const k of NAME_KEYS) {
    const names = list.map(o => (own(o, k) && isPlain(o[k]) ? String(o[k]).trim().toLowerCase() : ''));
    if (names.every(n => n !== '' && !/[\]\r\n]/.test(n)) && new Set(names).size === names.length) return k;
  }
  return null;
}

function flatten(payload) {
  const out = [];
  const seen = new Set();
  const add = (path, v) => {
    if (!path || seen.has(path) || out.length >= MAX_FIELDS) return;
    const t = text(v) ?? '';
    seen.add(path);
    out.push({ path, value: t.length > EXAMPLE_CHARS ? t.slice(0, EXAMPLE_CHARS) + '…' : t });
  };
  const visit = (node, path, depth) => {
    if (out.length >= MAX_FIELDS) return;
    if (isPlainOrNull(node)) { add(path, node); return; }
    if (typeof node !== 'object' || depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      if (node.every(isPlainOrNull)) { add(path, node); return; }   // a list of plain values is one field
      const nameKey = pairNameKey(node);
      node.slice(0, MAX_LIST).forEach((el, i) => {
        if (nameKey) {
          const base = `${path}[${nameKey}=${String(el[nameKey]).trim()}]`;
          for (const k of VALUE_KEYS) if (own(el, k)) visit(el[k], `${base}.${k}`, depth + 1);
        } else {
          visit(el, path ? `${path}.${i}` : String(i), depth + 1);
        }
      });
      return;
    }
    for (const k of Object.keys(node)) {
      if (k.trim() === '') continue;
      const bracketed = /[[\]]/.test(k);
      if (bracketed) {   // reachable only as a key exactly as written, which works at the top and for one value
        if (!path && isPlainOrNull(node[k])) add(k, node[k]);
        continue;
      }
      visit(node[k], path ? `${path}.${k}` : k, depth + 1);
    }
  };
  if (payload !== null && typeof payload === 'object') visit(payload, '', 0);
  return out;
}

function mapPayload(payload, fieldMap) {
  const map = fieldMap && typeof fieldMap === 'object' && !Array.isArray(fieldMap) ? fieldMap : {};
  const get = crmKey => text(pick(payload, map[crmKey]));
  let name = get('name') || '';
  if (!name && (map.first_name || map.last_name)) name = [get('first_name'), get('last_name')].filter(Boolean).join(' ');
  const email   = get('email')   || null;
  const phone   = get('phone')   || null;
  const company = get('company') || null;

  const customData = {};
  const skipped    = {};
  for (const [crmKey, incomingKey] of Object.entries(map)) {
    if (BUILTIN.has(crmKey) || !incomingKey) continue;
    const val = text(pick(payload, incomingKey));
    if (val !== null && val.trim() !== '') customData[crmKey] = val;
    else skipped[crmKey] = `incoming key "${incomingKey}" not found or empty in payload`;
  }
  return { name, email, phone, company, customData, skipped };
}

// The request body as an object. Text is read as JSON, else as a form post (a=1&b=2), else kept as it is.
function asPayload(body) {
  if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const s = Buffer.isBuffer(body) ? body.toString('utf8') : typeof body === 'string' ? body : '';
  if (!s.trim()) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed !== null && typeof parsed === 'object' ? parsed : { value: parsed };
  } catch { /* not JSON */ }
  if (/^[^\s=&<{[][^\s=&<{]*=/.test(s.trim())) {
    const form = {};
    for (const [k, v] of new URLSearchParams(s.trim())) if (k) form[k] = own(form, k) ? [].concat(form[k], v) : v;
    if (Object.keys(form).length) return form;
  }
  return { raw_body: s.slice(0, 5000) };
}

// What server.js mounts on the receive path, ahead of the app's express.json(): form posts (nested names like
// contact[email] become objects), multipart forms (their text fields; an uploaded file is not kept), and anything
// that is neither those nor application/json as text for asPayload() — JSON sent as text/plain, as
// application/vnd.…+json, or with no content type at all.
function bodyParsers(express) {
  const multer = require('multer');
  const fields = multer({ limits: { fieldSize: 100 * 1024, fields: 300, files: 0, parts: 320 } }).none();
  const typeOf = req => String(req.headers['content-type'] || '').toLowerCase();
  return [
    express.urlencoded({ extended: true, limit: BODY_LIMIT }),
    (req, res, next) => {
      if (!typeOf(req).startsWith('multipart/form-data')) return next();
      fields(req, res, () => { if (!req.body || typeof req.body !== 'object') req.body = {}; next(); });   // a refused part (a file) never fails the delivery
    },
    express.text({ limit: BODY_LIMIT, type: req => { const t = typeOf(req); return !/application\/json|x-www-form-urlencoded|multipart\//.test(t); } }),
  ];
}

module.exports = { BUILTIN, NAME_KEYS, VALUE_KEYS, MAX_FIELDS, MAX_LIST, EXAMPLE_CHARS, text, steps, pick, flatten, mapPayload, asPayload, bodyParsers };
