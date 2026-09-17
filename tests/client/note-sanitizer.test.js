// CLIENT test — the render-side sanitiser in public/js/core.js, driven in a
// fake browser with scripts enabled so inline event handlers are compiled the
// way a real browser compiles them. Skips itself if jsdom is not installed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { JSDOM, skipOpts } = require('../helpers/dom');
const { ROOT } = require('../helpers/load-route');

// What an attacker could have stored before the server started sanitising.
const OLD_ROW = '<b>bold</b><img src=x onerror="window.pwned=2"><a href="javascript:window.pwned=3">link</a><script>window.pwned=1</script><div>line</div>';

function browser() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const w = dom.window;
  try { w.eval(fs.readFileSync(path.join(ROOT, 'public', 'js', 'core.js'), 'utf8')); } catch { /* core.js touches page DOM at load; the helpers are still defined */ }
  return w;
}
// Put HTML into a live element and trigger what a browser would trigger for src=x.
function render(w, html) {
  const host = w.document.getElementById('host');
  host.innerHTML = html;
  host.querySelectorAll('img').forEach(img => img.dispatchEvent(new w.Event('error')));
  return host;
}

describe('sanitizeNoteHtml', skipOpts, () => {
  test('control: putting the old row in raw really does execute the handler', () => {
    const w = browser();
    render(w, OLD_ROW);
    assert.equal(w.pwned, 2);
  });

  test('the sanitised old row executes nothing and keeps bold, link text and the line', () => {
    const w = browser();
    const out = w.sanitizeNoteHtml(OLD_ROW);
    render(w, out);
    assert.equal(w.pwned, undefined);
    assert.doesNotMatch(out, /onerror|<img|<script|javascript:/i);
    assert.equal(out, '<b>bold</b><a>link</a><p>line</p>');
  });

  test('allowed links keep their address; everything else loses its attributes', () => {
    const w = browser();
    assert.equal(w.sanitizeNoteHtml('<a href="https://ok.test" target="_blank" onclick="x()">ok</a>'), '<a href="https://ok.test">ok</a>');
    assert.equal(w.sanitizeNoteHtml('<span style="color:red">red</span>'), 'red');
  });
});
