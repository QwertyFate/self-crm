// CLIENT (static) tests: every SET urgency level shows on the deal kanban card.
//
// THE BUG. Urgency is 0–4 (No urgency, Low, Medium, High, Very urgent). The
// board card, dealCard(), wrapped both its urgency stripe and its footer badge
// in `u >= 3`, so Low and Medium deals carried no marker at all on the board —
// indistinguishable from "no urgency". The LIST view calls urgencyBadge() with
// no gate and shows all four, and urgencyBadge() itself is documented as
// "badge for urgency 1–4 (nothing for 0)". The card was the odd one out.
// Reported as: "when the urgency of a deal is below high it doesn't show up in
// kanban mode — I want it reflected even if it's low, so users know what to
// take care of first".
//
// The rule now: hide ONLY level 0 (the data model already marks it
// `color: 'transparent'`); render 1–4, each with a visually DISTINCT stripe.
//
// dealCard() is executed for real (sliced out with client-fn.js), with its
// presentational helpers stubbed, so these assert what actually renders — not
// just what the source looks like.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, loadFns, sliceFn, sliceConst } = require('../helpers/client-fn');

const deals = read('public/js/deals.js');
const css   = read('public/style.css');

// t() returns its key, so urgencyLabel() falls back to the English label in
// DEAL_URGENCY — deterministic, no translation table needed.
const STUBS = `
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function t(k) { return k; }
  function icon() { return ''; }
  function avatar() { return ''; }
  function fmtEUR(v) { return v == null ? '' : String(v); }
  function fmtDateShort() { return ''; }
  function agoDays() { return ''; }
`;

const F = loadFns('public/js/deals.js',
  ['dealCard', 'urgencyMeta', 'urgencyLabel', 'urgencyBadge'],
  { extra: sliceConst('public/js/deals.js', 'DEAL_URGENCY') + STUBS });

const card = urgency => F.dealCard({
  id: 1, title: 'Portfolio', urgency, value: null, contact_name: null,
  assigned_to_name: null, created_at: '2026-10-01', updated_at: '2026-10-01',
});

const LEVELS = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Very urgent' };

describe('the kanban card shows every set urgency level', () => {
  for (const [u, label] of Object.entries(LEVELS)) {
    test(`urgency ${u} (${label}) renders both its stripe and its badge`, () => {
      const html = card(+u);
      assert.match(html, new RegExp(`class="urg urg-${u}"`), `no stripe for ${label}`);
      assert.match(html, /<span class="badge badge-/, `no badge for ${label}`);
      assert.ok(html.includes(`>${label}</span>`), `badge should read "${label}"`);
    });
  }

  test('urgency 0 (No urgency) still renders NO stripe and NO badge', () => {
    // The fix must widen 1–4, not switch the marker on for everything: "no
    // urgency" stays unmarked so the marked cards keep meaning something.
    const html = card(0);
    assert.doesNotMatch(html, /class="urg /, 'a stripe appeared for No urgency');
    assert.doesNotMatch(html, /<span class="badge/, 'a badge appeared for No urgency');
  });

  test('the badge comes straight from urgencyBadge(), the same call the list view makes', () => {
    // Consistency is the point: whatever the list shows, the board shows.
    for (const u of [1, 2, 3, 4]) assert.ok(card(u).includes(F.urgencyBadge(u)), `card ${u} ≠ list badge`);
  });

  test('the source no longer gates the marker on u >= 3', () => {
    const src = sliceFn(deals, 'dealCard', 'deals.js');
    assert.doesNotMatch(src, /u\s*>=\s*3/, 'the ">= 3" gate is what hid Low and Medium');
  });
});

describe('every level has its own, distinct stripe colour', () => {
  const stripe = n => {
    const m = css.match(new RegExp(`\\.urg-${n}\\s*\\{\\s*background:\\s*([^;}]+)`));
    assert.ok(m, `.urg-${n} has no CSS rule, so its stripe would be invisible`);
    return m[1].trim();
  };

  test('.urg-1 and .urg-2 exist (they did not — only 3 and 4 were styled)', () => {
    stripe(1); stripe(2);
  });

  test('the four stripes use four different colour tokens, so levels are tellable apart', () => {
    const colours = [1, 2, 3, 4].map(stripe);
    assert.equal(new Set(colours).size, 4, `stripe colours collide: ${colours.join(' | ')}`);
    // and they follow the badge tones, so stripe and badge agree on severity
    assert.match(stripe(1), /--success/);
    assert.match(stripe(2), /--info/);
    assert.match(stripe(3), /--warning/);
    assert.match(stripe(4), /--danger/);
  });
});
