// UNIT — utils/tar.js, the minimal ustar writer/reader behind backups. Everything here is
// pure: no database, no server. The one external check (the system `tar` lists the same
// names) runs only where a tar binary can be spawned.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { execFileSync } = require('child_process');
const { ROOT } = require('../helpers/load-route');
const tar = require(path.join(ROOT, 'utils', 'tar.js'));

const bytesOf = async gen => { const out = []; for await (const c of gen) out.push(Buffer.from(c)); return Buffer.concat(out); };
const list = async (buf, chunk = 65536) => {
  const out = [];
  const src = (async function* () { for (let i = 0; i < buf.length; i += chunk) yield buf.subarray(i, i + chunk); })();
  for await (const e of tar.readTar(src)) out.push({ name: e.name, size: e.size, mode: e.mode, body: await tar.collect(e.body) });
  return out;
};

describe('header layout', () => {
  const h = tar.tarHeader({ name: 'a/b.txt', size: 5, mode: 0o640, mtime: 1_760_000_000_000 });
  test('512 bytes, ustar magic and version, octal fields, NUL-terminated name', () => {
    assert.equal(h.length, 512);
    assert.equal(h.toString('latin1', 257, 263), 'ustar\0');
    assert.equal(h.toString('latin1', 263, 265), '00');
    assert.equal(h.toString('latin1', 0, 8), 'a/b.txt\0');
    assert.equal(h.toString('latin1', 100, 108), '0000640\0');
    assert.equal(h.toString('latin1', 124, 136), '00000000005\0');
    assert.equal(parseInt(h.toString('latin1', 136, 147), 8), 1_760_000_000);
    assert.equal(h[156], '0'.charCodeAt(0));
  });
  test('the checksum is the byte sum with its own field as spaces, "%06o\\0 "', () => {
    let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
    assert.equal(h.toString('latin1', 148, 156), sum.toString(8).padStart(6, '0') + '\0 ');
  });
  test('names over the field limits are refused at this level (the writer splits them first)', () => {
    assert.throws(() => tar.tarHeader({ name: 'x'.repeat(101), size: 0 }), e => e.code === 'TAR_NAME_TOO_LONG');
    assert.throws(() => tar.tarHeader({ name: 'a', size: 8 ** 11 }), e => e.code === 'TAR_TOO_LARGE');
  });
});

describe('round trips', () => {
  const entries = [
    { name: 'manifest.json', size: 2, body: Buffer.from('{}') },
    { name: 'empty.bin', size: 0, body: Buffer.alloc(0) },
    { name: 'exact.bin', size: 512, body: Buffer.alloc(512, 7) },
    { name: 'files/a/b/c.pdf', size: 1000, body: Buffer.alloc(1000, 1) },
    { name: 'ümlaut/Vertrag Müller.pdf', size: 3, body: 'abc' },
  ];
  test('writer output is a 512 multiple ending in two zero blocks; reader returns identical names, sizes and bytes', async () => {
    const buf = await bytesOf(tar.tarEntries(entries));
    assert.equal(buf.length % 512, 0);
    assert.ok(buf.subarray(buf.length - 1024).every(b => b === 0));
    const back = await list(buf);
    assert.deepEqual(back.map(e => [e.name, e.size]), entries.map(e => [e.name, e.size]));
    for (let i = 0; i < entries.length; i++) assert.deepEqual(back[i].body, Buffer.from(entries[i].body));
    assert.equal(back[0].mode, 0o644);
  });
  test('the reader does not care how the bytes are chunked (1-byte and 7-byte chunks)', async () => {
    const buf = await bytesOf(tar.tarEntries(entries));
    for (const chunk of [1, 7, 513]) assert.deepEqual((await list(buf, chunk)).map(e => e.body.length), entries.map(e => e.size));
  });
  test('an async-iterable body (a file stream) works, and a body longer or shorter than `size` is cut or zero-filled', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-'));
    const f = path.join(tmp, 'big.bin'); fs.writeFileSync(f, Buffer.alloc(70000, 9));
    const buf = await bytesOf(tar.tarEntries([
      { name: 'stream.bin', size: 70000, body: fs.createReadStream(f) },
      { name: 'longer.bin', size: 3, body: Buffer.from('abcdef') },
      { name: 'shorter.bin', size: 6, body: Buffer.from('abc') },
    ]));
    const back = await list(buf);
    assert.deepEqual(back[0].body, Buffer.alloc(70000, 9));
    assert.deepEqual(back[1].body, Buffer.from('abc'));
    assert.deepEqual(back[2].body, Buffer.concat([Buffer.from('abc'), Buffer.alloc(3)]));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  test('gzip round trip through zlib streams', async () => {
    const gz = await bytesOf(Readable.from(tar.tarEntries(entries)).pipe(zlib.createGzip()));
    assert.deepEqual([gz[0], gz[1]], [0x1f, 0x8b]);
    const back = [];
    for await (const e of tar.readTar(Readable.from([gz]).pipe(zlib.createGunzip()))) back.push([e.name, (await tar.collect(e.body)).length]);
    assert.deepEqual(back, entries.map(e => [e.name, e.size]));
  });
});

describe('long names', () => {
  test('splitUstarName: ≤100 bytes untouched; 101–255 split at a "/" into prefix ≤155 / name ≤100; no split possible → null', () => {
    assert.deepEqual(tar.splitUstarName('a/b'), { prefix: '', name: 'a/b' });
    const long = `files/contact-documents/${'d'.repeat(60)}/${'e'.repeat(60)}/${'f'.repeat(40)}.pdf`;
    const s = tar.splitUstarName(long);
    assert.ok(s && Buffer.byteLength(s.name) <= 100 && Buffer.byteLength(s.prefix) <= 155 && `${s.prefix}/${s.name}` === long);
    assert.equal(tar.splitUstarName('files/' + 'x'.repeat(120)), null, 'a single 120-byte segment cannot be split');
    assert.equal(tar.splitUstarName('ü'.repeat(60)), null, 'byte length, not character count: 60 ü = 120 bytes');
  });
  test('writer: split names and PAX fallback both read back whole; the system tar agrees where available', async () => {
    const names = [
      `files/contact-documents/${'d'.repeat(60)}/${'e'.repeat(60)}/${'f'.repeat(40)}.pdf`,     // ustar prefix split
      `files/task-attachments/7/12/1760000000000-${'Z'.repeat(200)}.bin`,                       // one 220-byte segment → PAX
      `files/${'ü'.repeat(70)}.pdf`,                                                           // UTF-8 single segment → PAX
    ];
    const buf = await bytesOf(tar.tarEntries(names.map((name, i) => ({ name, size: i + 1, body: Buffer.alloc(i + 1, 65) }))));
    assert.deepEqual((await list(buf)).map(e => e.name), names);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-'));
    const f = path.join(tmp, 'x.tar'); fs.writeFileSync(f, buf);
    try {
      // NFC on both sides: macOS bsdtar prints the ü name in a different Unicode normalisation form
      const out = execFileSync('tar', ['-tf', f], { encoding: 'utf8' }).trim().split('\n').map(s => s.normalize('NFC'));
      assert.deepEqual(out, names.map(s => s.normalize('NFC')), 'bsdtar/gnutar list the PAX and prefix names identically');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});

describe('safety', () => {
  test('safeEntryName refuses anything that could leave the destination', () => {
    for (const bad of ['../x', 'a/../b', '/abs', 'C:/x', 'c:\\x', 'a\\b', '', '.', 'a//b', 'a/./b', 'a\0b', null, 5]) assert.equal(tar.safeEntryName(bad), null, JSON.stringify(bad));
    assert.equal(tar.safeEntryName('files/7/55/x.pdf'), 'files/7/55/x.pdf');
  });
  test('the writer refuses a bad name before emitting anything for it', async () => {
    await assert.rejects(bytesOf(tar.tarEntries([{ name: '../escape', size: 0, body: '' }])), e => e.code === 'TAR_BAD_NAME');
  });
  test('the reader refuses a bad checksum, a truncated archive and an unsupported entry type', async () => {
    const good = await bytesOf(tar.tarEntries([{ name: 'a.txt', size: 3, body: 'abc' }]));
    const bad = Buffer.from(good); bad[0] ^= 0xff;
    await assert.rejects(list(bad), e => e.code === 'TAR_BAD_CHECKSUM');
    await assert.rejects(list(good.subarray(0, 512 + 2)), e => e.code === 'TAR_TRUNCATED');
    const link = tar.tarHeader({ name: 'l', size: 0, type: '2' });
    await assert.rejects(list(Buffer.concat([link, Buffer.alloc(1024)])), e => e.code === 'TAR_UNSUPPORTED');
  });
  test('a crafted archive with "../" in a PAX path is refused by the reader, and extractTar re-checks containment', async () => {
    const pax = tar.paxHeader({ path: '../../etc/passwd' });
    const evil = Buffer.concat([...pax, tar.tarHeader({ name: 'passwd', size: 1 }), Buffer.from('x'), Buffer.alloc(511), Buffer.alloc(1024)]);
    await assert.rejects(list(evil), e => e.code === 'TAR_BAD_NAME');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-'));
    const dest = path.join(tmp, 'out');
    const ok = await bytesOf(tar.tarEntries([{ name: 'files/a/b.txt', size: 2, body: 'hi' }, { name: 'skip.me', size: 1, body: 'x' }]));
    const r = await tar.extractTar(Readable.from([ok]), dest, { filter: e => e.name !== 'skip.me' });
    assert.deepEqual(r, { files: 1, bytes: 2 });
    assert.equal(fs.readFileSync(path.join(dest, 'files', 'a', 'b.txt'), 'utf8'), 'hi');
    assert.equal(fs.existsSync(path.join(dest, 'skip.me')), false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
