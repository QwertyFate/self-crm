// CLIENT (static, no jsdom) tests for the layout system: one modal size ladder
// (no inline widths), one modal anatomy (header → one .modal-body → footer),
// every table inside .table-wrap, empty states via shared classes, and the
// responsive ladder 1280 / 1024 / 820 / 600 declared in style.css.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { read } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const css  = read('public/style.css');
const jsFiles = fs.readdirSync(path.join(ROOT, 'public/js')).filter(f => f.endsWith('.js'));
const js = Object.fromEntries(jsFiles.map(f => [f, read('public/js/' + f)]));

// Source of the element that starts at `start` (balanced <form>/<div> count).
function elementAt(src, start, tag) {
  const re = new RegExp(`<${tag}\\b|<\\/${tag}>`, 'g'); re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(src))) { depth += m[0].startsWith('</') ? -1 : 1; if (depth === 0) return src.slice(start, m.index + tag.length + 3); }
  throw new Error(`unbalanced <${tag}> from offset ${start}`);
}

describe('modal size ladder', () => {
  test('style.css declares every stop once, next to .modal', () => {
    for (const cls of ['.modal-sm', '.modal-md', '.modal-lg', '.modal-xl', '.modal-full']) {
      assert.equal((css.match(new RegExp(`^${cls.replace('.', '\\.')} \\{`, 'gm')) || []).length, 1, cls);
    }
    const modalIdx = css.indexOf('\n.modal {'), smIdx = css.indexOf('\n.modal-sm {');
    assert.ok(smIdx > modalIdx && smIdx - modalIdx < 2000, '.modal-sm lives in the modal section, not 1,700 lines later');
    assert.match(css, /\.modal > form \{[^}]*flex-direction: column;[^}]*min-height: 0;/, 'a form between .modal and .modal-body keeps the scroll anatomy');
  });
  test('no modal box in index.html sets its width, max-width or max-height inline', () => {
    const boxes = [...html.matchAll(/<div class="modal[^"]*"([^>]*)>/g)].map(m => m[1]).filter(a => /style="[^"]*(width|max-height|overflow)/.test(a));
    assert.deepEqual(boxes, []);
  });
  test('no modal box built from JS sets its width inline either', () => {
    for (const [f, src] of Object.entries(js)) {
      const hits = [...src.matchAll(/<div class="modal[^"]*"[^>]*style="[^"]*(width|max-height)[^"]*"/g)].map(m => m[0]);
      assert.deepEqual(hits, [], f);
    }
  });
});

describe('modal anatomy', () => {
  test('every modal <form> that carries its own action bar has exactly one .modal-body, with the actions outside it', () => {
    // A form that owns a .modal-actions / .modal-footer is the modal's content
    // column (the deal form is not: its footer is a sibling of the columns).
    const offenders = [];
    for (const m of html.matchAll(/<form\b/g)) {
      const form = elementAt(html, m.index, 'form');
      if (!/modal-(actions|footer)/.test(form)) continue;
      const id = (form.match(/id="([^"]+)"/) || [])[1];
      const bodies = (form.match(/class="modal-body[^"]*"/g) || []).length;
      if (bodies !== 1) offenders.push(`${id}: ${bodies} bodies`);
      const body = bodies ? elementAt(form, form.indexOf('<div class="modal-body'), 'div') : '';
      if (/modal-(actions|footer)/.test(body)) offenders.push(`${id}: actions inside the body`);
    }
    assert.deepEqual(offenders, []);
  });
  test('no ad-hoc "padding:20px" body divs stand in for .modal-body', () => {
    assert.deepEqual([...html.matchAll(/<div style="padding:20px[^"]*">/g)].map(m => m[0]), []);
  });
  test('no grid-template-columns is set inline anywhere in index.html', () => {
    assert.deepEqual([...html.matchAll(/style="[^"]*grid-template-columns[^"]*"/g)].map(m => m[0]), []);
  });
});

describe('page container', () => {
  test('the reading-page and scroll classes exist and the reading pages carry them', () => {
    assert.match(css, /\.page-reading > \* \{[^}]*max-width: var\(--content-max\)/);
    assert.match(css, /\.page-scroll \{ overflow-y: auto; \}/);
    for (const id of ['page-settings', 'page-integrations', 'page-workspaces', 'page-activities', 'page-analytics']) {
      assert.match(html, new RegExp(`<section id="${id}" class="page[^"]*\\bpage-reading\\b[^"]*"`), id);
    }
    assert.doesNotMatch(html, /<section id="page-[a-z]+" class="page[^"]*" style=/, 'no inline style on any page section');
  });
  test('one page-header primitive; analytics no longer double-gaps', () => {
    assert.match(css, /^\.page-header, \.analytics-header, \.settings-page-header, \.chat-page-header \{/m);
    assert.doesNotMatch(css, /\.analytics-header \{[^}]*margin-bottom/);
    assert.doesNotMatch(html, /id="analytics-main-sections" style=/);
  });
});

describe('tables and empty states', () => {
  test('JS never emits an unstyled .data-table; every JS table is wrapped in .table-wrap', () => {
    for (const [f, src] of Object.entries(js)) {
      assert.doesNotMatch(src, /class="data-table"/, f);
      for (const m of src.matchAll(/<table class="table"/g)) {
        assert.match(src.slice(Math.max(0, m.index - 80), m.index), /table-wrap/, `${f}: table at ${m.index} has a .table-wrap`);
      }
    }
  });
  test('JS empty states use .empty-state / .empty-inline, not per-call-site padding', () => {
    assert.match(css, /^\.empty-state\.compact \{/m);
    assert.match(css, /^\.empty-inline \{/m);
    const offenders = [];
    for (const [f, src] of Object.entries(js)) {
      for (const m of src.matchAll(/<(p|div|td|li)[^>]*style="[^"]*color:var\(--muted\)[^"]*"[^>]*>[^<]*(No |no_|Select a|Save the)/g)) offenders.push(`${f}: ${m[0].slice(0, 70)}`);
    }
    assert.deepEqual(offenders, []);
  });
  test('hand-rolled inputs in modals.js use the shared field-input classes', () => {
    assert.match(css, /^\.field-input, \.field-input-sm \{/m);
    assert.ok(js['modals.js'].includes('class="field-input'), 'modals.js uses .field-input');
    assert.doesNotMatch(js['modals.js'], /style="[^"]*border:1px solid var\(--border\);border-radius:4px/);
  });
});

describe('responsive ladder', () => {
  test('breakpoints 1280 / 1024 / 820 / 600 and a coarse-pointer rule exist, in that order', () => {
    const idx = ['1280px', '1024px', '820px', '600px'].map(w => css.indexOf(`@media (max-width: ${w})`));
    assert.ok(idx.every(i => i > 0), `all four breakpoints present: ${idx}`);
    assert.deepEqual([...idx].sort((a, b) => a - b), idx, 'declared widest to narrowest');
    assert.match(css, /@media \(pointer: coarse\)/);
  });
  test('kanban columns share one token and give way on phones', () => {
    assert.match(css, /--kanban-col-w:\s*272px/);
    assert.match(css, /\.pipeline-col \{[^}]*min-width: var\(--kanban-col-w\); max-width: var\(--kanban-col-w\)/);
    assert.match(css, /\.task-col \{[^}]*min-width: var\(--kanban-col-w\); max-width: var\(--kanban-col-w\)/);
    const tablet = css.slice(css.indexOf('@media (max-width: 820px)'));
    const phone  = css.slice(css.indexOf('@media (max-width: 600px)'));
    assert.match(phone, /--kanban-col-w: calc\(100vw/);
    assert.match(phone, /\.toolbar input \{[^}]*min-width: 0/);
    assert.match(tablet, /\.modal-body-grid \{[^}]*grid-template-columns: 1fr/, 'the two-column modal body stacks from tablet down');
  });
  test('the help button sits in the corner; there is no chat floating button', () => {
    assert.equal(/\.chat-fab\b/.test(css), false, 'chat lives on its page, not in a floating panel');
    assert.match(css, /\.guide-help-fab \{[^}]*bottom: var\(--sp-5\)/);
  });
  test('the integrations URL box is a flex row like the key field', () => {
    assert.match(css, /\.intg-url-box \{[^}]*display: flex/);
  });
});
