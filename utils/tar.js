/* ═══════════════════════════════════════════════════════════════════════════
   TAR — a minimal ustar writer and reader, for backups (utils/backup.js).

   WHY OUR OWN. Node has gzip (zlib) but no tar, PGlite does not export its
   bundled one, and the local build must stay `npm install` only — no system
   `tar` binary, no archive dependency. ~200 lines cover exactly what a backup
   needs: regular files, streamed, with long names.

   FORMAT (POSIX ustar, what every tar tool reads)
     header   512 bytes: name[100] mode[8] uid[8] gid[8] size[12] mtime[12]
              chksum[8] type[1] linkname[100] magic "ustar\0" version "00"
              uname[32] gname[32] devmajor[8] devminor[8] prefix[155] pad[12].
              Numbers are octal ASCII, NUL-terminated. The checksum is the byte
              sum of the header with the chksum field itself as spaces.
     body     the file, then zero padding to a 512 multiple.
     end      two 512-byte zero blocks.
     names    up to 100 bytes in `name`; longer paths split at a "/" into
              prefix (≤155) + name (≤100). A single segment longer than 100
              bytes (an uploaded file name can be 255 chars) gets a PAX "x"
              header carrying `path=` — the standard extension, so nothing is
              ever silently dropped.

   SAFETY  readers refuse names that could leave the destination: "..", ".",
   empty segments, a leading "/", a drive letter, a backslash. extractTar
   re-checks the resolved path is inside the destination before writing.

   STREAMING  tarEntries() is an async generator: it yields header, body
   chunks and padding entry by entry, so a backup of many uploaded files never
   holds more than one file's chunk in memory. readTar() is the mirror image
   over any async iterable of Buffers (a gunzip stream, a file stream). Consume
   an entry's `body` before asking for the next entry; whatever is left unread
   is skipped automatically.
   ═══════════════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const BLOCK = 512;

class TarError extends Error {
  constructor(code, message) { super(message); this.name = 'TarError'; this.code = code; }
}

// ── Names ────────────────────────────────────────────────────────────────────
// The entry name as it may appear inside an archive, or null: "/"-joined, every segment
// non-empty and not "." or "..", no leading "/", no drive letter, no backslash, no NUL.
function safeEntryName(name) {
  if (typeof name !== 'string' || !name) return null;
  if (name.includes('\0') || name.includes('\\')) return null;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return null;
  const segs = name.split('/');
  if (segs.some(s => s === '' || s === '.' || s === '..')) return null;
  return segs.join('/');
}

// ustar split: { prefix, name } with name ≤ 100 bytes and prefix ≤ 155 bytes, or null when no
// "/" makes that possible (then the writer falls back to a PAX header).
function splitUstarName(name) {
  if (Buffer.byteLength(name) <= 100) return { prefix: '', name };
  let idx = name.lastIndexOf('/');
  while (idx > 0) {
    const prefix = name.slice(0, idx), rest = name.slice(idx + 1);
    if (Buffer.byteLength(rest) <= 100 && Buffer.byteLength(prefix) <= 155) return { prefix, name: rest };
    idx = name.lastIndexOf('/', idx - 1);
  }
  return null;
}

// The longest prefix of `s` that fits in `max` bytes without cutting a UTF-8 sequence.
function truncateBytes(s, max) {
  let out = s;
  while (Buffer.byteLength(out) > max) out = out.slice(0, -1);
  return out;
}

// ── Header ───────────────────────────────────────────────────────────────────
function octal(n, len) {   // len counts the trailing NUL
  if (!Number.isInteger(n) || n < 0) throw new TarError('TAR_UNSUPPORTED', `not a non-negative integer: ${n}`);
  const s = n.toString(8);
  if (s.length > len - 1) throw new TarError('TAR_TOO_LARGE', `${n} does not fit a ${len - 1}-digit octal field`);
  return s.padStart(len - 1, '0') + '\0';
}

function tarHeader({ name, size, mode = 0o644, mtime = Date.now(), type = '0', prefix = '' }) {
  if (Buffer.byteLength(name) > 100)   throw new TarError('TAR_NAME_TOO_LONG', `name over 100 bytes: ${name}`);
  if (Buffer.byteLength(prefix) > 155) throw new TarError('TAR_NAME_TOO_LONG', `prefix over 155 bytes: ${prefix}`);
  const h = Buffer.alloc(BLOCK, 0);
  h.write(name, 0, 100, 'utf8');
  h.write(octal(mode & 0o7777, 8), 100, 8, 'latin1');
  h.write(octal(0, 8), 108, 8, 'latin1');
  h.write(octal(0, 8), 116, 8, 'latin1');
  h.write(octal(size, 12), 124, 12, 'latin1');
  h.write(octal(Math.max(0, Math.floor(mtime / 1000)), 12), 136, 12, 'latin1');
  h.fill(0x20, 148, 156);                       // checksum computed with its own field as spaces
  h.write(type, 156, 1, 'latin1');
  h.write('ustar\0', 257, 6, 'latin1');
  h.write('00', 263, 2, 'latin1');
  h.write('crm', 265, 32, 'latin1');
  h.write('crm', 297, 32, 'latin1');
  h.write(octal(0, 8), 329, 8, 'latin1');
  h.write(octal(0, 8), 337, 8, 'latin1');
  if (prefix) h.write(prefix, 345, 155, 'utf8');
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');
  return h;
}

// PAX extended header: an "x" entry whose body is "<len> key=value\n" lines, <len> counting the
// whole line including itself. Returns the blocks to emit before the real header.
function paxHeader(records, { mtime = Date.now() } = {}) {
  let body = '';
  for (const [key, value] of Object.entries(records)) {
    const base = ` ${key}=${value}\n`;
    let n = Buffer.byteLength(base) + 1;
    for (;;) { const total = Buffer.byteLength(base) + String(n).length; if (total === n) break; n = total; }
    body += `${n}${base}`;
  }
  const buf = Buffer.from(body, 'utf8');
  const header = tarHeader({ name: truncateBytes(`PaxHeader/${path.basename(String(records.path || 'entry'))}`, 100), size: buf.length, type: 'x', mtime });
  const pad = padding(buf.length);
  return pad ? [header, buf, Buffer.alloc(pad)] : [header, buf];
}

const padding = size => (BLOCK - (size % BLOCK)) % BLOCK;

// ── Writer ───────────────────────────────────────────────────────────────────
function toChunks(body) {
  if (body == null) return [];
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return [Buffer.from(body.buffer, body.byteOffset, body.byteLength)];
  if (typeof body === 'string') return [Buffer.from(body, 'utf8')];
  return body;   // an (async) iterable of chunks, e.g. fs.createReadStream
}

// entries: Iterable | AsyncIterable of { name, size, body, mode?, mtime? }. Yields the archive
// as Buffers. The body is cut or zero-filled to exactly `size` bytes, so a file that changes
// while it is read can never break the archive's framing.
async function* tarEntries(entries) {
  for await (const e of entries) {
    const name = safeEntryName(e.name);
    if (!name) throw new TarError('TAR_BAD_NAME', `invalid entry name: ${String(e.name)}`);
    const size = e.size;
    if (!Number.isInteger(size) || size < 0) throw new TarError('TAR_UNSUPPORTED', `${name}: size must be a non-negative integer`);
    const split = splitUstarName(name);
    if (split) {
      yield tarHeader({ name: split.name, prefix: split.prefix, size, mode: e.mode, mtime: e.mtime });
    } else {
      for (const block of paxHeader({ path: name }, { mtime: e.mtime })) yield block;
      yield tarHeader({ name: truncateBytes(name, 100), size, mode: e.mode, mtime: e.mtime });
    }
    let written = 0;
    if (size > 0) {
      for await (const chunk of toChunks(e.body)) {
        let c = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (written + c.length > size) c = c.subarray(0, size - written);
        if (c.length) { yield c; written += c.length; }
        if (written >= size) break;
      }
      if (written < size) yield Buffer.alloc(size - written);
    }
    const pad = padding(size);
    if (pad) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(BLOCK * 2);
}

const tarStream = entries => Readable.from(tarEntries(entries));

// ── Reader ───────────────────────────────────────────────────────────────────
function chunkReader(source) {
  const it = source[Symbol.asyncIterator] ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  let buf = Buffer.alloc(0), done = false;
  async function fill(n) {
    while (buf.length < n && !done) {
      const r = await it.next();
      if (r.done) { done = true; break; }
      const c = Buffer.isBuffer(r.value) ? r.value : Buffer.from(r.value);
      buf = buf.length ? Buffer.concat([buf, c]) : c;
    }
  }
  return {
    async read(n, { allowEof = false } = {}) {
      await fill(n);
      if (buf.length < n) {
        if (allowEof && buf.length === 0) return null;
        throw new TarError('TAR_TRUNCATED', `archive ends ${n - buf.length} bytes early`);
      }
      const out = buf.subarray(0, n); buf = buf.subarray(n);
      return out;
    },
  };
}

const cstr = (h, off, len) => { const end = h.indexOf(0, off); return h.toString('utf8', off, end === -1 || end > off + len ? off + len : end); };
function parseOctal(h, off, len) {
  if (h[off] & 0x80) throw new TarError('TAR_UNSUPPORTED', 'base-256 numeric field');
  const s = h.toString('latin1', off, off + len).replace(/\0.*$/s, '').trim();
  if (!s) return 0;
  if (!/^[0-7]+$/.test(s)) throw new TarError('TAR_UNSUPPORTED', `bad octal field: ${JSON.stringify(s)}`);
  return parseInt(s, 8);
}
function checksumOk(h) {
  const stored = parseOctal(h, 148, 8);
  let unsigned = 0, signed = 0;
  for (let i = 0; i < BLOCK; i++) {
    const b = i >= 148 && i < 156 ? 0x20 : h[i];
    unsigned += b; signed += b > 127 ? b - 256 : b;
  }
  return stored === unsigned || stored === signed;
}
function parsePax(buf) {
  const out = {}; let pos = 0; const s = buf.toString('utf8');
  while (pos < s.length) {
    const sp = s.indexOf(' ', pos); if (sp === -1) break;
    const len = parseInt(s.slice(pos, sp), 10); if (!len) break;
    const line = s.slice(pos, pos + len);
    const eq = line.indexOf('=');
    if (eq > sp - pos) out[line.slice(sp - pos + 1, eq)] = line.slice(eq + 1).replace(/\n$/, '');
    pos += len;
  }
  return out;
}

// Yields { name, size, mode, mtime, type: '0', body } per regular file. `body` is an async
// iterable of Buffers for exactly `size` bytes; unread remainder is skipped before the next
// header. Directories are skipped; PAX "x" headers are applied to the entry that follows.
// allowLeadingSlash: PGlite's own data-dir tar names every entry "/PG_VERSION", "/base/…"; with
// this option the slashes are stripped instead of refused. Never use it on an untrusted archive
// that is going to be extracted — utils/backup.js only READS the inner tar this way.
async function* readTar(source, { allowLeadingSlash = false } = {}) {
  const reader = chunkReader(source);
  let pax = null;
  for (;;) {
    const h = await reader.read(BLOCK, { allowEof: true });
    if (h === null || h.every(b => b === 0)) return;
    if (!checksumOk(h)) throw new TarError('TAR_BAD_CHECKSUM', 'header checksum mismatch');
    if (!cstr(h, 257, 6).startsWith('ustar')) throw new TarError('TAR_UNSUPPORTED', 'not a ustar archive');
    const size = parseOctal(h, 124, 12);
    const type = h[156] === 0 ? '0' : String.fromCharCode(h[156]);
    const skip = async n => { let left = n; while (left > 0) { const c = await reader.read(Math.min(left, 65536)); left -= c.length; } };
    if (type === 'x') { pax = parsePax(await reader.read(size)); await skip(padding(size)); continue; }
    if (type === '5' || type === 'g') { await skip(size + padding(size)); pax = null; continue; }
    if (type !== '0') throw new TarError('TAR_UNSUPPORTED', `entry type "${type}" is not supported`);
    let name = cstr(h, 0, 100);
    const prefix = cstr(h, 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    if (pax && pax.path) name = pax.path;
    pax = null;
    if (allowLeadingSlash) name = name.replace(/^\/+/, '');
    const safe = safeEntryName(name);
    if (!safe) throw new TarError('TAR_BAD_NAME', `unsafe entry name in archive: ${name}`);
    let remaining = size;
    const body = (async function* () {
      while (remaining > 0) { const c = await reader.read(Math.min(remaining, 65536)); remaining -= c.length; yield c; }
    })();
    yield { name: safe, size, mode: parseOctal(h, 100, 8), mtime: parseOctal(h, 136, 12) * 1000, type: '0', body };
    await skip(remaining); remaining = 0;
    await skip(padding(size));
  }
}

async function collect(body) {
  const chunks = []; for await (const c of body) chunks.push(c);
  return Buffer.concat(chunks);
}

// Writes every regular file of the archive under destDir (directories created as needed). The
// filter sees each entry before anything is written; a resolved path outside destDir throws.
async function extractTar(source, destDir, { filter = () => true, onEntry } = {}) {
  const root = path.resolve(destDir);
  let files = 0, bytes = 0;
  for await (const entry of readTar(source)) {
    if (!filter(entry)) continue;
    const abs = path.resolve(root, ...entry.name.split('/'));
    if (!abs.startsWith(root + path.sep)) throw new TarError('TAR_BAD_NAME', `entry escapes the destination: ${entry.name}`);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await pipeline(Readable.from(entry.body), fs.createWriteStream(abs, { mode: entry.mode || 0o644 }));
    files++; bytes += entry.size;
    if (onEntry) onEntry(entry, abs);
  }
  return { files, bytes };
}

module.exports = { TarError, BLOCK, safeEntryName, splitUstarName, tarHeader, paxHeader, padding, tarEntries, tarStream, readTar, collect, extractTar };
