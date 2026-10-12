// Multipart file names arrive from the browser as raw UTF-8 bytes; multer 2.x decodes them as
// latin1 unless told otherwise, so "Vertrag Müller.pdf" was stored and shown as
// "Vertrag MÃ¼ller.pdf". Both upload routes now set defParamCharset: 'utf8'. The end-to-end
// proof is tests/integration/app-smoke.test.js (it uploads an umlaut name and reads it back);
// this pins the option so it cannot quietly disappear.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../helpers/load-route');

describe('multer decodes file names as UTF-8', () => {
  for (const rel of ['routes/contact-documents.js', 'routes/task-attachments.js']) {
    test(rel, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const cfg = src.slice(src.indexOf('multer({'), src.indexOf('});', src.indexOf('multer({')) + 3);
      assert.match(cfg, /defParamCharset:\s*'utf8'/, cfg);
      assert.match(cfg, /memoryStorage\(\)/, 'still in memory, still capped');
    });
  }
  test('multer really defaults to latin1 (if this ever fails, the option may have become redundant)', () => {
    const multer = fs.readFileSync(path.join(ROOT, 'node_modules', 'multer', 'index.js'), 'utf8');
    assert.match(multer, /defParamCharset = options\.defParamCharset \|\| 'latin1'/);
  });
});
