// CLIENT (static) test: a row's edit and delete buttons can be SEEN.
//
// WHAT THIS CAUGHT (2026-11-24). The base rule `.row-actions { opacity: 0 }` hides the
// group until something reveals it: `tr:hover` in tables, `.settings-row` in Settings.
// A pipeline's header in Settings → Deals is neither, so its rename and delete buttons
// were drawn, clickable and invisible. The user looked for "delete pipeline" and found
// nothing. So: every group the Settings screens draw must sit in a container a rule
// reveals AT REST (no hover needed), and that rule must win over the base one.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');

const css = read('public/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const REVEALING = ['settings-row', 'pipeline-settings-header'];

// Every rule that sets `opacity` on a .row-actions group: { ancestors, state, classes, value, at }.
function opacityRules(src) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m, at = 0;
  while ((m = re.exec(src))) {
    const value = /(?:^|;)\s*opacity\s*:\s*([\d.]+)/.exec(m[2]);
    if (!value) continue;
    for (const sel of m[1].split(',').map(s => s.trim())) {
      const parts = sel.split(/\s+/);
      if (parts[parts.length - 1] !== '.row-actions') continue;
      const ancestors = parts.slice(0, -1);
      out.push({
        sel, at: at++, value: Number(value[1]),
        state: ancestors.some(a => /:(hover|focus-within)/.test(a)),
        ancestors: ancestors.map(a => a.replace(/:(hover|focus-within)/g, '')),
        classes: (sel.match(/\.[\w-]+/g) || []).length,
      });
    }
  }
  return out;
}

// The opacity a group has at rest inside the given chain of containers ('tr' or '.class').
function atRest(src, chain) {
  const hit = opacityRules(src)
    .filter(r => !r.state && r.ancestors.every(a => chain.includes(a)))
    .sort((a, b) => a.classes - b.classes || a.at - b.at);
  return hit.length ? hit[hit.length - 1].value : 1;
}

describe('the edit and delete buttons of a Settings row are visible without hovering', () => {
  test('the base rule still hides a bare group (the fault this test exists for)', () => {
    assert.equal(atRest(css, []), 0);
  });

  for (const cls of REVEALING) {
    test(`.${cls} shows its buttons at rest and fully on hover or focus`, () => {
      assert.ok(atRest(css, [`.${cls}`]) > 0, `.${cls} .row-actions is invisible at rest`);
      const lit = opacityRules(css).filter(r => r.state && r.ancestors.includes(`.${cls}`));
      assert.ok(lit.some(r => r.value === 1 && /:hover/.test(r.sel)), 'no hover rule');
      assert.ok(lit.some(r => r.value === 1 && /:focus-within/.test(r.sel)), 'no keyboard focus rule');
    });
  }

  test('a pipeline header alone is enough: the fix does not lean on a class the header lacks', () => {
    assert.ok(atRest(css, ['.pipeline-settings-row', '.pipeline-settings-header']) > 0);
    const without = css.replace(/\.pipeline-settings-header[^{}]*\.row-actions[^{}]*\{[^{}]*\}/g, '');
    assert.equal(atRest(without, ['.pipeline-settings-row', '.pipeline-settings-header']), 0, 'the measure cannot see the fault');
  });

  for (const file of ['public/js/settings.js', 'public/js/objects.js']) {
    test(`${file}: every group of row buttons sits in a container that reveals it`, () => {
      const src = read(file);
      const groups = [...src.matchAll(/class="row-actions"/g)].map(m => m.index);
      assert.ok(groups.length > 0);
      let from = 0;
      for (const at of groups) {
        const before = src.slice(from, at);
        const own = [...before.matchAll(/class="([^"]*)"/g)].some(m => m[1].split(/\s+/).some(c => REVEALING.includes(c)));
        assert.ok(own, `the row buttons at offset ${at} have no revealing container of their own`);
        from = at;
      }
    });
  }

  test('the pipeline header carries both buttons: rename and delete', () => {
    const src = read('public/js/settings.js');
    const header = /<div class="pipeline-settings-header">([\s\S]*?)<div class="pipeline-stages-list">/.exec(src);
    assert.ok(header);
    assert.match(header[1], /class="row-actions"/);
    assert.match(header[1], /onclick="editPipeline\(/);
    assert.match(header[1], /onclick="deletePipeline\(\$\{p\.id\}\)"/);
  });
});
