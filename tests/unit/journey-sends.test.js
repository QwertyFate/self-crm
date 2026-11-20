// UNIT tests for utils/journey-sends.js (CUSTOMER_JOURNEY_CHANGES Part 17, 2026-11-20): the safeguards around the
// workflows' emails, so that the connected Gmail address is not blocked.
//
// Here: the limits and their defaults by kind of address, what a person may save, the gate — each limit with the
// time it names, the emails that already wait, one address in two workspaces — the count, the pause with its
// doubling and Google's own time, who is told, lifting it, and the trim. The database is tests/helpers/fake-sends.js,
// which answers every statement of the file as it is meant; what the statements do in Postgres was checked on a
// real throwaway database (see the change log). The engine's side is journey-run.test.js, the routes' side
// journey-mail.test.js and journey.test.js.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const sends = require('../../utils/journey-sends');
const { createSends, SQL } = require('../helpers/fake-sends');
const { read } = require('../helpers/client-fn');

const NOW = new Date('2026-11-20T10:00:00.000Z');
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const ago = span => new Date(NOW.getTime() - span), in_ = span => new Date(NOW.getTime() + span);
const WS = 7, OTHER = 8, FROM = 'news@firma.de';

// One address, connected in workspace 7 — and what else a test puts into the lists.
function world({ conn = {}, ...lists } = {}) {
  const s = createSends({ mail: [{ workspace_id: WS, email: FROM, ...conn }], ...lists });
  return { ...s, pool: { query: async (sql, p) => { const r = s.answer(sql, p); if (!r) throw new Error('not a statement of journey-sends.js: ' + sql); return r; } } };
}
const mailed = (n, when, extra = {}) => Array.from({ length: n }, () => ({ workspace_id: WS, from_email: FROM, contact_id: null, kind: 'step', sent_at: when, ...extra }));
const waiting = (n, why, due, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, workspace_id: WS, flow_id: 2, status: 'waiting', held: why, due_at: due, ...extra }));
const gate = (w, more = {}) => sends.gate(w.pool, { workspaceId: WS, now: NOW, ...more });
const short = r => [r.ok, r.why || null, r.until ? r.until.toISOString() : null];

describe('the limits of an address', () => {
  test('a gmail.com or googlemail.com address is a personal one; any other domain is a Google Workspace', () => {
    for (const a of ['max@gmail.com', 'Max@GMail.com', ' max@googlemail.com ', 'a.b+c@gmail.com']) assert.equal(sends.kindOf(a), 'personal', a);
    for (const a of ['news@firma.de', 'x@gmail.com.firma.de', 'x@notgmail.com', 'x@gmail.co', 'gmail.com@firma.de', '', null, undefined]) assert.equal(sends.kindOf(a), 'workspace', String(a));
  });
  test('below what Google allows: a personal address 400 a day and 40 an hour of Google\'s 500, a Workspace 1,500 and 150 of 2,000; three to one person', () => {
    assert.deepEqual(sends.limitsOf({ email: 'max@gmail.com' }), { kind: 'personal', google_day: 500, defaults: { day: 400, hour: 40, person: 3 }, max: { day: 500, hour: 500, person: 20 }, limits: { day: 400, hour: 40, person: 3 } });
    assert.deepEqual(sends.limitsOf({ email: FROM }), { kind: 'workspace', google_day: 2000, defaults: { day: 1500, hour: 150, person: 3 }, max: { day: 2000, hour: 2000, person: 20 }, limits: { day: 1500, hour: 150, person: 3 } });
    for (const kind of ['personal', 'workspace']) {
      assert.ok(sends.DEFAULTS[kind].day < sends.GOOGLE_DAY[kind], 'the CRM stops before Google does');
      assert.ok(sends.DEFAULTS[kind].hour <= sends.DEFAULTS[kind].day);
    }
  });
  test('what was saved for the connection counts — NULL is the default, and each of the three on its own', () => {
    assert.deepEqual(sends.limitsOf({ email: FROM, limit_day: 800, limit_hour: 60, limit_person: 5 }).limits, { day: 800, hour: 60, person: 5 });
    assert.deepEqual(sends.limitsOf({ email: FROM, limit_day: null, limit_hour: 60, limit_person: null }).limits, { day: 1500, hour: 60, person: 3 });
    assert.deepEqual(sends.limitsOf({ email: FROM, limit_day: 2000, limit_hour: 2000, limit_person: 20 }).limits, { day: 2000, hour: 2000, person: 20 }, 'up to what Google allows');
  });
  test('a saved number never counts for more than that kind of address may have, and an hour never for more than the day', () => {
    assert.deepEqual(sends.limitsOf({ email: 'max@gmail.com', limit_day: 1500, limit_hour: 900, limit_person: 99 }).limits, { day: 500, hour: 500, person: 20 }, 'saved for a Workspace address, read for a personal one');
    assert.deepEqual(sends.limitsOf({ email: FROM, limit_day: 10 }).limits, { day: 10, hour: 10, person: 3 }, 'the default hour would be more than this day');
    assert.deepEqual(sends.limitsOf({ email: FROM, limit_day: 200, limit_hour: 300 }).limits.hour, 200);
  });
  test('something saved that is no whole number from 1 on is not a limit: the default holds', () => {
    for (const bad of [0, -5, 1.5, '50', NaN, Infinity, true, {}]) assert.deepEqual(sends.limitsOf({ email: FROM, limit_day: bad, limit_hour: bad, limit_person: bad }).limits, { day: 1500, hour: 150, person: 3 }, String(bad));
    const one = sends.limitsOf({ email: FROM });
    one.defaults.day = 1; one.max.day = 1;
    assert.equal(sends.limitsOf({ email: FROM }).defaults.day, 1500, 'what is handed out is a copy');
    assert.equal(sends.limitsOf({ email: FROM }).max.day, 2000);
  });
});

describe('what a person may save as limits', () => {
  test('whole numbers in their ranges, or null for "the default" — each of the three', () => {
    assert.deepEqual(sends.readLimits(FROM, { day: 800, hour: 60, person: 5 }), { day: 800, hour: 60, person: 5 });
    assert.deepEqual(sends.readLimits(FROM, { day: null, hour: null, person: null }), { day: null, hour: null, person: null });
    assert.deepEqual(sends.readLimits(FROM, { day: 2000, hour: 2000, person: 20 }), { day: 2000, hour: 2000, person: 20 }, 'the most a Workspace address may have');
    assert.deepEqual(sends.readLimits(FROM, { day: 1, hour: 1, person: 1 }), { day: 1, hour: 1, person: 1 }, 'the least');
    assert.deepEqual(sends.readLimits('max@gmail.com', { day: 500, hour: null, person: null }), { day: 500, hour: null, person: null });
    assert.deepEqual(sends.readLimits(FROM, { day: '800', hour: '60', person: '5' }), { day: 800, hour: 60, person: 5 }, 'a number written as digits is that number');
    assert.deepEqual(sends.readLimits(FROM, { day: 800, hour: 60, person: 5, email: 'x@y.de', workspace_id: 9 }), { day: 800, hour: 60, person: 5 }, 'nothing else is taken');
  });
  test('the day at most what Google allows that kind of address; the hour at most the day — the default day when none is named', () => {
    assert.equal(sends.readLimits('max@gmail.com', { day: 501, hour: null, person: null }), null);
    assert.equal(sends.readLimits(FROM, { day: 2001, hour: null, person: null }), null);
    assert.equal(sends.readLimits(FROM, { day: 100, hour: 101, person: null }), null);
    assert.deepEqual(sends.readLimits(FROM, { day: 100, hour: 100, person: null }), { day: 100, hour: 100, person: null });
    assert.equal(sends.readLimits('max@gmail.com', { day: null, hour: 401, person: null }), null, 'the day is the default 400');
    assert.deepEqual(sends.readLimits('max@gmail.com', { day: null, hour: 400, person: null }), { day: null, hour: 400, person: null });
    assert.equal(sends.readLimits(FROM, { day: null, hour: null, person: 21 }), null);
  });
  test('anything else is refused: a number that is none, one that is not whole or below 1, a limit that is not named', () => {
    const ok = { day: 800, hour: 60, person: 5 };
    for (const bad of [0, -1, 1.5, '1.5', '1e3', ' 5', '', 'abc', true, false, [], {}, NaN, Infinity, '123456']) {
      for (const key of Object.keys(ok)) assert.equal(sends.readLimits(FROM, { ...ok, [key]: bad }), null, `${key}: ${JSON.stringify(bad)}`);
    }
    for (const key of Object.keys(ok)) { const { [key]: _, ...rest } = ok; assert.equal(sends.readLimits(FROM, rest), null, `${key} is not named`); }
    for (const body of [undefined, null, 'x', 5, [800, 60, 5]]) assert.equal(sends.readLimits(FROM, body), null, String(body));
  });
});

describe('the gate: may one more email go out from the address now', () => {
  test('yes while there is room — and what is known about the address comes along', async () => {
    const w = world({ sends: [...mailed(5, ago(2 * HOUR)), ...mailed(2, ago(10 * MIN))] });
    const r = await gate(w);
    assert.equal(r.ok, true);
    assert.deepEqual([r.state.from, r.state.kind, r.state.limits, r.state.sent, r.state.paused_until, r.state.pause_count], [FROM, 'workspace', { day: 1500, hour: 150, person: 3 }, { day: 7, hour: 2, person: 0 }, null, 0]);
    assert.deepEqual(w.asked, ['read'], 'one question while there is room');
  });
  test('no address connected: said so, and nothing more is asked', async () => {
    const w = world();
    assert.deepEqual(await sends.gate(w.pool, { workspaceId: OTHER, now: NOW }), { ok: false, why: 'no_sender', until: null, state: null });
  });
  test('the day is full: it waits until the email that fills it is 24 hours old', async () => {
    const w = world({ conn: { limit_day: 5 }, sends: [...mailed(4, ago(HOUR)), ...mailed(1, ago(23 * HOUR))] });
    assert.deepEqual(short(await gate(w)), [false, 'limit_day', in_(HOUR).toISOString()]);
    assert.deepEqual(w.asked, ['read', 'slot']);
    const more = world({ conn: { limit_day: 5 }, sends: [...mailed(4, ago(HOUR)), ...mailed(2, ago(22 * HOUR)), ...mailed(1, ago(23 * HOUR))] });
    assert.deepEqual(short(await gate(more)), [false, 'limit_day', in_(2 * HOUR).toISOString()], 'seven out with a limit of five (it was lowered): room only once three of them are a day old — when the fifth newest has left');
  });
  test('24 hours are 24 hours: an email sent exactly that long ago no longer counts, one a moment later does', async () => {
    assert.equal((await gate(world({ conn: { limit_day: 1 }, sends: mailed(1, ago(DAY)) }))).ok, true);
    assert.deepEqual(short(await gate(world({ conn: { limit_day: 1 }, sends: mailed(1, ago(DAY - 1)) }))), [false, 'limit_day', in_(1).toISOString()]);
  });
  test('the hour is full: it waits until the email that fills it is 60 minutes old', async () => {
    const w = world({ conn: { limit_hour: 3 }, sends: [...mailed(2, ago(10 * MIN)), ...mailed(1, ago(50 * MIN)), ...mailed(20, ago(3 * HOUR))] });
    assert.deepEqual(short(await gate(w)), [false, 'limit_hour', in_(10 * MIN).toISOString()]);
    assert.equal((await gate(world({ conn: { limit_hour: 3 }, sends: [...mailed(2, ago(10 * MIN)), ...mailed(1, ago(HOUR))] }))).ok, true, 'exactly an hour ago is out of the hour');
  });
  test('one person: at most so many workflow emails in 24 hours — to that contact, from this address', async () => {
    const to40 = when => mailed(1, when, { contact_id: 40 })[0];
    const w = world({ sends: [to40(ago(2 * HOUR)), to40(ago(5 * HOUR)), to40(ago(20 * HOUR)), ...mailed(1, ago(HOUR), { contact_id: 41 }), ...mailed(1, ago(HOUR), { kind: 'test' })] });
    assert.deepEqual(short(await gate(w, { contactId: 40 })), [false, 'limit_person', in_(4 * HOUR).toISOString()], 'until the third newest to this person is a day old');
    assert.deepEqual(w.asked, ['read', 'slotPerson']);
    assert.equal((await gate(w, { contactId: 41 })).ok, true, 'another contact has room');
    assert.equal((await gate(w)).ok, true, 'no contact, no limit per person');
    const five = world({ conn: { limit_person: 1 }, sends: [to40(ago(26 * HOUR)), { ...to40(ago(HOUR)), kind: 'test' }, { ...to40(ago(HOUR)), from_email: 'other@firma.de' }] });
    assert.equal((await gate(five, { contactId: 40 })).ok, true, 'older than a day, a test email, another address: none of them counts');
  });
  test('asked in one order: a pause, then the day, then the hour, then the person — the first that holds is the reason', async () => {
    const all = { conn: { limit_day: 3, limit_hour: 3, limit_person: 3, paused_until: in_(2 * HOUR), pause_reason: 'google_limit', pause_detail: 'User-rate limit exceeded.', pause_count: 1 }, sends: mailed(3, ago(10 * MIN), { contact_id: 40 }) };
    const paused = await gate(world(all), { contactId: 40 });
    assert.deepEqual(short(paused), [false, 'paused', in_(2 * HOUR).toISOString()]);
    assert.deepEqual([paused.state.pause_reason, paused.state.pause_detail], ['google_limit', 'User-rate limit exceeded.']);
    assert.equal((await gate(world({ ...all, conn: { limit_day: 3, limit_hour: 3, limit_person: 3 } }), { contactId: 40 })).why, 'limit_day');
    assert.equal((await gate(world({ ...all, conn: { limit_day: 9, limit_hour: 3, limit_person: 3 } }), { contactId: 40 })).why, 'limit_hour');
    assert.equal((await gate(world({ ...all, conn: { limit_day: 9, limit_hour: 9, limit_person: 3 } }), { contactId: 40 })).why, 'limit_person');
    assert.equal((await gate(world({ ...all, conn: { limit_day: 9, limit_hour: 9, limit_person: 9 } }), { contactId: 40 })).ok, true);
  });
  test('a pause that is over is no pause — only its count is still known', async () => {
    const r = await gate(world({ conn: { paused_until: ago(1), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 2 } }));
    assert.deepEqual([r.ok, r.state.paused_until, r.state.pause_reason, r.state.pause_detail, r.state.pause_count], [true, null, null, null, 2]);
    assert.equal((await gate(world({ conn: { paused_until: NOW, pause_count: 1 } }))).ok, true, 'at its very end it is over');
  });
  test('a test email goes to the person who asked for it: a pause and a full day keep it back, the hour and the person do not — and nobody waits for it', async () => {
    const hourFull = world({ conn: { limit_hour: 2 }, sends: mailed(2, ago(MIN)) });
    assert.equal((await gate(hourFull, { test: true })).ok, true);
    assert.deepEqual(hourFull.asked, ['read']);
    const dayFull = world({ conn: { limit_day: 2 }, sends: mailed(2, ago(MIN)) });
    assert.deepEqual(short(await gate(dayFull, { test: true })), [false, 'limit_day', null]);
    assert.deepEqual(dayFull.asked, ['read'], 'no time is worked out for it');
    assert.equal((await gate(world({ conn: { paused_until: in_(HOUR), pause_count: 1 } }), { test: true })).why, 'paused');
  });
  test('ONE ADDRESS IN TWO WORKSPACES is one address: both workspaces\' emails count, each connection has its own limits', async () => {
    const lists = { mail: [{ workspace_id: WS, email: FROM, limit_day: 5 }, { workspace_id: OTHER, email: 'News@Firma.de', limit_day: 50 }, { workspace_id: 9, email: 'other@firma.de', limit_day: 1 }],
      sends: [...mailed(2, ago(HOUR)), ...mailed(3, ago(2 * HOUR), { workspace_id: OTHER }), ...mailed(9, ago(HOUR), { workspace_id: 9, from_email: 'other@firma.de' })] };
    const s = createSends(lists), pool = { query: async (sql, p) => s.answer(sql, p) };
    const mine = await sends.gate(pool, { workspaceId: WS, now: NOW }), theirs = await sends.gate(pool, { workspaceId: OTHER, now: NOW });
    assert.deepEqual([mine.ok, mine.why, mine.state.sent.day], [false, 'limit_day', 5], 'two of its own and three of the other workspace');
    assert.deepEqual([theirs.ok, theirs.state.sent.day, theirs.state.limits.day], [true, 5, 50], 'the same count, its own limit');
    assert.equal(theirs.state.from, FROM, 'the address in small letters, however it was saved');
  });
  test('a pause is the address\'s too: a workspace that connected it later is paused with the others', async () => {
    const s = createSends({ mail: [{ workspace_id: WS, email: FROM }, { workspace_id: OTHER, email: FROM, paused_until: in_(3 * HOUR), pause_reason: 'google_limit', pause_detail: 'Retry later', pause_count: 2 }] });
    const r = await sends.gate({ query: async (sql, p) => s.answer(sql, p) }, { workspaceId: WS, now: NOW });
    assert.deepEqual([...short(r), r.state.pause_detail, r.state.pause_count], [false, 'paused', in_(3 * HOUR).toISOString(), 'Retry later', 2]);
  });
  test('THE EMAILS THAT ALREADY WAIT are a queue: the next one is put behind them, not beside them', async () => {
    const conn = { limit_hour: 3 }, out = [...mailed(1, ago(50 * MIN)), ...mailed(1, ago(40 * MIN)), ...mailed(1, ago(30 * MIN))];
    const until = async runs => short(await gate(world({ conn, sends: out, runs })))[2];
    assert.equal(await until([]), in_(10 * MIN).toISOString(), 'nobody waits: the first free place');
    assert.equal(await until(waiting(1, 'limit_hour', in_(10 * MIN))), in_(20 * MIN).toISOString(), 'one waits for that place: the second');
    assert.equal(await until([...waiting(1, 'limit_hour', in_(10 * MIN)), ...waiting(1, 'limit_hour', in_(20 * MIN))]), in_(30 * MIN).toISOString());
    assert.equal(await until([...waiting(1, 'limit_hour', in_(10 * MIN)), ...waiting(1, 'limit_hour', in_(20 * MIN)), ...waiting(1, 'limit_hour', in_(30 * MIN))]), in_(70 * MIN).toISOString(),
      'three wait for the three places: the fourth goes when the first of THEM is an hour old');
  });
  test('…and the same over days: thirty at once with ten a day go out ten, ten and ten', async () => {
    const conn = { limit_day: 10 }, t0 = ago(HOUR), out = mailed(10, t0);
    const until = async runs => short(await gate(world({ conn, sends: out, runs })))[2];
    assert.equal(await until([]), new Date(t0.getTime() + DAY).toISOString());
    assert.equal(await until(waiting(9, 'limit_day', new Date(t0.getTime() + DAY))), new Date(t0.getTime() + DAY).toISOString(), 'the tenth of the second day');
    assert.equal(await until(waiting(10, 'limit_day', new Date(t0.getTime() + DAY))), new Date(t0.getTime() + 2 * DAY).toISOString(), 'the first of the third');
  });
  test('who waits for something else, in a workflow that is off, at another address, or is no longer waiting, is not in that queue', async () => {
    const conn = { limit_hour: 1 }, out = mailed(1, ago(30 * MIN)), free = in_(30 * MIN);
    const lists = runs => ({ mail: [{ workspace_id: WS, email: FROM, ...conn }, { workspace_id: 9, email: 'other@firma.de' }], sends: out, runs, off: [5] });
    const until = async runs => { const s = createSends(lists(runs)); return short(await sends.gate({ query: async (sql, p) => s.answer(sql, p) }, { workspaceId: WS, now: NOW }))[2]; };
    const others = [...waiting(1, 'limit_day', free), ...waiting(1, 'paused', free), ...waiting(1, null, free), ...waiting(1, 'limit_hour', free, { flow_id: 5 }), ...waiting(1, 'limit_hour', free, { workspace_id: 9 }),
      ...waiting(1, 'limit_hour', free, { status: 'working' }), ...waiting(1, 'limit_hour', free, { status: 'stopped' }), ...waiting(1, 'limit_hour', ago(MIN))];
    assert.equal(await until(others), free.toISOString(), 'none of them takes the place');
    assert.equal(await until([...others, ...waiting(1, 'limit_hour', free)]), in_(90 * MIN).toISOString(), 'one that does wait for it');
  });
  test('a time that cannot be worked out: looked at again in a quarter of an hour, never "now"', async () => {
    const w = world({ conn: { limit_day: 2 }, sends: mailed(2, ago(MIN)) });
    const pool = { query: async (sql, p) => (/OFFSET/.test(sql) ? { rows: [] } : w.answer(sql, p)) };
    assert.deepEqual(short(await sends.gate(pool, { workspaceId: WS, now: NOW })), [false, 'limit_day', in_(15 * MIN).toISOString()]);
    const past = { query: async (sql, p) => (/OFFSET/.test(sql) ? { rows: [{ t: ago(3 * DAY) }] } : w.answer(sql, p)) };
    assert.deepEqual(short(await sends.gate(past, { workspaceId: WS, now: NOW })), [false, 'limit_day', in_(15 * MIN).toISOString()], 'a time that is over is no time to wait for');
    assert.equal(sends.RECHECK_MS, 15 * MIN);
  });
  test('a database that cannot be asked is no "yes": the gate throws, and its caller must not send', async () => {
    await assert.rejects(sends.gate({ query: async () => { throw new Error('connection lost'); } }, { workspaceId: WS, now: NOW }), /connection lost/);
    const w = world({ conn: { limit_day: 2 }, sends: mailed(2, ago(MIN)) });
    await assert.rejects(sends.gate({ query: async (sql, p) => { if (/OFFSET/.test(sql)) throw new Error('timeout'); return w.answer(sql, p); } }, { workspaceId: WS, now: NOW }), /timeout/);
  });
});

describe('counting an email that went out', () => {
  test('one row: whose, from which address in small letters, to whom, a step or a test, when', async () => {
    const w = world();
    await sends.sent(w.pool, { workspaceId: WS, from: 'News@Firma.de', contactId: 40, kind: 'step', now: NOW });
    await sends.sent(w.pool, { workspaceId: WS, from: FROM, kind: 'test', now: NOW });
    await sends.sent(w.pool, { workspaceId: WS, from: FROM, contactId: 41, kind: 'anything', now: NOW });
    assert.deepEqual(w.w.sends, [{ workspace_id: WS, from_email: FROM, contact_id: 40, kind: 'step', sent_at: NOW }, { workspace_id: WS, from_email: FROM, contact_id: null, kind: 'test', sent_at: NOW },
      { workspace_id: WS, from_email: FROM, contact_id: 41, kind: 'step', sent_at: NOW }]);
    assert.deepEqual(w.asked, ['count', 'count', 'count'], 'nothing else is written while no pause went before');
  });
  test('what went out is what the gate counts next', async () => {
    const w = world({ conn: { limit_hour: 2 } });
    for (let i = 0; i < 2; i++) { const door = await gate(w); assert.equal(door.ok, true); await sends.sent(w.pool, { workspaceId: WS, from: FROM, now: NOW, state: door.state }); }
    assert.deepEqual(short(await gate(w)), [false, 'limit_hour', in_(HOUR).toISOString()]);
    assert.ok(!w.asked.includes('proven'), 'no pause went before: nothing about a pause is written');
  });
  test('the first email that goes out after a pause ends the doubling — for the address, in every workspace', async () => {
    const lists = { mail: [{ workspace_id: WS, email: FROM, paused_until: ago(MIN), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 3 }, { workspace_id: OTHER, email: FROM, paused_until: ago(MIN), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 3 }] };
    const s = createSends(lists), pool = { query: async (sql, p) => s.answer(sql, p) };
    const door = await sends.gate(pool, { workspaceId: WS, now: NOW });
    assert.deepEqual([door.ok, door.state.pause_count], [true, 3]);
    await sends.sent(pool, { workspaceId: WS, from: FROM, contactId: 40, now: NOW, state: door.state });
    assert.deepEqual(s.w.mail.map(m => [m.paused_until, m.pause_reason, m.pause_detail, m.pause_count]), [[null, null, null, 0], [null, null, null, 0]]);
    assert.deepEqual(s.asked, ['read', 'count', 'proven']);
  });
  test('a pause that is in force is never lifted by an email that got out beside it', async () => {
    const w = world({ conn: { paused_until: in_(HOUR), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 2 } });
    await sends.sent(w.pool, { workspaceId: WS, from: FROM, now: NOW, state: { pause_count: 1 } });   // what the gate knew before the pause came
    assert.deepEqual([w.w.mail[0].paused_until, w.w.mail[0].pause_count], [in_(HOUR), 2]);
  });
});

describe('how long a pause is', () => {
  const until = (count, retryAt) => (sends.pauseUntil({ now: NOW, count, retryAt }).getTime() - NOW.getTime()) / MIN;
  test('Google names no time: one hour — and twice as long each time one follows another, at most 24 hours', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 50].map(n => until(n)), [60, 120, 240, 480, 960, 1440, 1440, 1440]);
  });
  test('Google names a time: until then — at least five minutes, at most 24 hours', () => {
    assert.equal(until(0, in_(20 * MIN)), 20);
    assert.equal(until(0, in_(3 * HOUR)), 180);
    assert.equal(until(0, in_(10 * 1000)), 5, 'ten seconds would only ask Google again at once');
    assert.equal(until(0, in_(30 * HOUR)), 1440);
  });
  test('a time that is over, or none at all, is no time: the hour holds', () => {
    for (const bad of [ago(MIN), NOW, null, undefined, 'tomorrow', new Date('x'), 12345]) assert.equal(until(0, bad), 60, String(bad));
  });
  test('a second pause in a row: Google\'s time was kept to once and Google still said no — it counts only when it is the later one', () => {
    assert.equal(until(1, in_(20 * MIN)), 120);
    assert.equal(until(1, in_(3 * HOUR)), 180);
    assert.equal(until(3, in_(20 * MIN)), 480);
    assert.equal(until(9, in_(20 * MIN)), 1440);
  });
});

describe('Google says "limit": the address is paused', () => {
  const MEMBERS = [{ user_id: 1, workspace_id: WS, role: 'owner' }, { user_id: 2, workspace_id: WS, role: 'admin' }, { user_id: 3, workspace_id: WS, role: 'member' }, { user_id: 9, workspace_id: OTHER, role: 'owner' },
    { user_id: 20, workspace_id: 9, role: 'owner' }];
  const both = (extra = {}) => { const s = createSends({ mail: [{ workspace_id: WS, email: FROM }, { workspace_id: OTHER, email: 'News@Firma.de' }, { workspace_id: 9, email: 'other@firma.de' }], members: MEMBERS, ...extra });
    const told = []; return { ...s, told, pool: { query: async (sql, p) => s.answer(sql, p) }, tell: { notifyUser: async (...a) => { told.push(a); return true; } } }; };
  test('for an hour, in every workspace that sends with it — with Google\'s own words', async () => {
    const w = both();
    const out = await sends.pause(w.pool, { from: 'News@Firma.de', now: NOW, detail: 'User-rate limit exceeded. (Mail sending)', tell: w.tell });
    assert.deepEqual(out, { until: in_(HOUR), fresh: true, count: 1 });
    assert.deepEqual(w.w.mail.map(m => [m.workspace_id, m.paused_until || null, m.pause_reason || null, m.pause_detail || null, m.pause_count || 0]),
      [[WS, in_(HOUR), 'google_limit', 'User-rate limit exceeded. (Mail sending)', 1], [OTHER, in_(HOUR), 'google_limit', 'User-rate limit exceeded. (Mail sending)', 1], [9, null, null, null, 0]]);
    for (const wid of [WS, OTHER]) assert.deepEqual(short(await sends.gate(w.pool, { workspaceId: wid, now: in_(59 * MIN) })).slice(0, 2), [false, 'paused']);
    assert.equal((await sends.gate(w.pool, { workspaceId: 9, now: NOW })).ok, true, 'another address goes on');
    assert.equal((await sends.gate(w.pool, { workspaceId: WS, now: in_(HOUR) })).ok, true, 'and when the hour is over, so is the pause');
  });
  test('every owner and admin of those workspaces is told, once — no member, and nobody of another address', async () => {
    const w = both();
    await sends.pause(w.pool, { from: FROM, now: NOW, detail: 'x', tell: w.tell });
    assert.deepEqual(w.told.map(a => [a[0], a[1], a[2]]), [[WS, null, 1], [WS, null, 2], [OTHER, null, 9]], 'workspace, nobody as the one who did it, the person');
    const [, , , note] = w.told[0];
    assert.deepEqual([note.type, note.category, note.title], ['journey_mail_paused', 'system', 'Workflow emails paused: news@firma.de']);
    assert.match(note.body, /sending limit/); assert.match(note.body, /for about 1 hour;/); assert.match(note.body, /lower the daily limit/);
    assert.doesNotMatch(JSON.stringify(w.told), /token|sealed/i);
  });
  test('Google\'s own time is kept to: the pause ends then, and the people are told how long', async () => {
    const w = both();
    assert.deepEqual((await sends.pause(w.pool, { from: FROM, now: NOW, retryAt: in_(20 * MIN), detail: 'Retry after …', tell: w.tell })).until, in_(20 * MIN));
    assert.match(w.told[0][3].body, /for about 20 minutes;/);
  });
  test('one pause after another, with no email going out in between: one, two, four hours … never more than a day', async () => {
    const w = both();
    let at = NOW; const spans = [];
    for (let i = 0; i < 7; i++) {
      const out = await sends.pause(w.pool, { from: FROM, now: at, detail: 'x', tell: w.tell });
      assert.equal(out.fresh, true);
      spans.push((out.until.getTime() - at.getTime()) / HOUR);
      at = out.until;   // the pause is over, the next email is refused again
    }
    assert.deepEqual(spans, [1, 2, 4, 8, 16, 24, 24]);
    assert.equal(w.w.mail[0].pause_count, 7);
    assert.equal(w.told.length, 7 * 3, 'told once per pause');
  });
  test('an email that goes out in between starts it at one hour again', async () => {
    const w = both();
    const first = await sends.pause(w.pool, { from: FROM, now: NOW, detail: 'x', tell: w.tell });
    const after = new Date(first.until.getTime() + MIN), door = await sends.gate(w.pool, { workspaceId: WS, now: after });
    await sends.sent(w.pool, { workspaceId: WS, from: FROM, now: after, state: door.state });
    const again = await sends.pause(w.pool, { from: FROM, now: new Date(after.getTime() + MIN), detail: 'x', tell: w.tell });
    assert.deepEqual([(again.until.getTime() - after.getTime() - MIN) / HOUR, again.count], [1, 1]);
  });
  test('paused already — two refusals at the same moment: one pause, nothing written again, nobody told twice', async () => {
    const w = both();
    const first = await sends.pause(w.pool, { from: FROM, now: NOW, detail: 'first', tell: w.tell });
    w.asked.length = 0;
    const second = await sends.pause(w.pool, { from: FROM, now: in_(MIN), retryAt: in_(10 * HOUR), detail: 'second', tell: w.tell });
    assert.deepEqual(second, { until: first.until, fresh: false });
    assert.deepEqual(w.asked, ['pauseWas']);
    assert.deepEqual([w.w.mail[0].pause_detail, w.w.mail[0].pause_count, w.told.length], ['first', 1, 3]);
  });
  test('the emails that waited for the last pause wait for this one — in one statement; who waits for a limit keeps its own time', async () => {
    const runs = [...waiting(2, 'paused', ago(MIN)), ...waiting(1, 'paused', ago(MIN), { workspace_id: OTHER }), ...waiting(1, 'limit_day', in_(5 * HOUR)), ...waiting(1, 'paused', ago(MIN), { workspace_id: 9 }), ...waiting(1, 'paused', ago(MIN), { status: 'done' })];
    const w = both({ runs });
    const { until } = await sends.pause(w.pool, { from: FROM, now: NOW, detail: 'x', tell: w.tell });
    assert.deepEqual(w.w.runs.map(r => r.due_at.toISOString()), [until, until, until, in_(5 * HOUR), ago(MIN), ago(MIN)].map(d => d.toISOString()));
    assert.equal(w.asked.filter(a => a === 'pausePush').length, 1);
  });
  test('telling that fails, or nobody to tell with, does not undo the pause; Google\'s words are cut to a length, and none are none', async () => {
    const w = both();
    const errors = [], real = console.error; console.error = (...a) => errors.push(a.join(' '));
    try {
      const out = await sends.pause(w.pool, { from: FROM, now: NOW, detail: 'x'.repeat(500), tell: { notifyUser: async () => { throw new Error('bell broken'); } } });
      assert.equal(out.fresh, true);
      assert.equal(w.w.mail[0].pause_detail.length, 300);
      const broken = both(), pool = { query: async (sql, p) => { if (/FROM user_workspaces/.test(sql)) throw new Error('members away'); return broken.answer(sql, p); } };
      assert.equal((await sends.pause(pool, { from: FROM, now: NOW, detail: '', tell: broken.tell })).fresh, true);
      assert.equal(broken.w.mail[0].pause_detail, null);
      assert.ok(errors.some(e => /telling about the paused address failed: members away/.test(e)), 'said in the server\'s log');
    } finally { console.error = real; }
    const quiet = both();
    assert.equal((await sends.pause(quiet.pool, { from: FROM, now: NOW, detail: 'x' })).fresh, true, 'no tell handed in');
    assert.ok(!quiet.asked.includes('managers'));
    const half = both(), heard = [];
    await sends.pause(half.pool, { from: FROM, now: NOW, detail: 'x', tell: { notifyUser: async (w, actor, userId) => { if (userId === 1) throw new Error('bell broken'); heard.push(userId); return true; } } });
    assert.deepEqual(heard, [2, 9], 'one person who cannot be told does not keep the others from hearing of it');
  });
  test('an address nobody is connected with any more: nothing to pause, nobody told', async () => {
    const w = both();
    const out = await sends.pause(w.pool, { from: 'gone@firma.de', now: NOW, detail: 'x', tell: w.tell });
    assert.deepEqual([out.fresh, out.until, w.told.length], [false, in_(HOUR), 0]);
  });
});

describe('lifting a pause, saving limits, another address, old rows', () => {
  test('"Send again now": the pause is lifted for the address, the emails that waited for it are due now — the count stays', async () => {
    const mail = [{ workspace_id: WS, email: FROM, paused_until: in_(5 * HOUR), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 2 }, { workspace_id: OTHER, email: FROM, paused_until: in_(5 * HOUR), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 2 },
      { workspace_id: 9, email: 'other@firma.de', paused_until: in_(5 * HOUR), pause_reason: 'google_limit', pause_detail: 'y', pause_count: 1 }];
    const runs = [...waiting(1, 'paused', in_(5 * HOUR)), ...waiting(1, 'paused', in_(5 * HOUR), { workspace_id: OTHER }), ...waiting(1, 'limit_day', in_(9 * HOUR)), ...waiting(1, 'paused', in_(5 * HOUR), { workspace_id: 9 }), ...waiting(1, 'paused', ago(HOUR))];
    const s = createSends({ mail, runs }), pool = { query: async (sql, p) => s.answer(sql, p) };
    await sends.resume(pool, 'News@Firma.de', NOW);
    assert.deepEqual(s.w.mail.map(m => [m.paused_until, m.pause_reason, m.pause_detail, m.pause_count]), [[null, null, null, 2], [null, null, null, 2], [in_(5 * HOUR), 'google_limit', 'y', 1]]);
    assert.deepEqual(s.w.runs.map(r => r.due_at.toISOString()), [NOW, NOW, in_(9 * HOUR), in_(5 * HOUR), ago(HOUR)].map(d => d.toISOString()), 'only this address\'s, only those that waited for the pause, none that was due already');
    assert.equal((await sends.gate(pool, { workspaceId: WS, now: NOW })).ok, true);
    const next = await sends.pause(pool, { from: FROM, now: in_(MIN), detail: 'again' });
    assert.equal((next.until.getTime() - in_(MIN).getTime()) / HOUR, 4, 'Google says "limit" again before an email went out: the longer pause');
  });
  test('saving limits: the three numbers of this workspace\'s connection — and its emails that wait for a limit are looked at again at once', async () => {
    const runs = [...waiting(1, 'limit_day', in_(5 * HOUR)), ...waiting(1, 'limit_hour', in_(HOUR)), ...waiting(1, 'limit_person', in_(2 * HOUR)), ...waiting(1, 'paused', in_(3 * HOUR)), ...waiting(1, null, in_(4 * HOUR)),
      ...waiting(1, 'limit_day', in_(5 * HOUR), { workspace_id: OTHER }), ...waiting(1, 'limit_day', in_(5 * HOUR), { status: 'stopped' })];
    const s = createSends({ mail: [{ workspace_id: WS, email: FROM }, { workspace_id: OTHER, email: FROM }], runs }), pool = { query: async (sql, p) => s.answer(sql, p) };
    await sends.saveLimits(pool, WS, { day: 900, hour: null, person: 2 }, NOW);
    assert.deepEqual(s.w.mail.map(m => [m.limit_day ?? null, m.limit_hour ?? null, m.limit_person ?? null]), [[900, null, 2], [null, null, null]], 'the other workspace\'s connection keeps its own');
    assert.deepEqual(s.w.runs.map(r => r.due_at.toISOString()), [NOW, NOW, NOW, in_(3 * HOUR), in_(4 * HOUR), in_(5 * HOUR), in_(5 * HOUR)].map(d => d.toISOString()));
    assert.deepEqual((await sends.gate(pool, { workspaceId: WS, now: NOW })).state.limits, { day: 900, hour: 150, person: 2 });
  });
  test('another address takes the connection\'s place: the old one\'s limits and pause are not the new one\'s', async () => {
    const w = world({ conn: { limit_day: 900, limit_hour: 90, limit_person: 9, paused_until: in_(HOUR), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 4 } });
    await sends.forget(w.pool, WS);
    const { workspace_id, email, ...rest } = w.w.mail[0];
    assert.deepEqual(rest, { limit_day: null, limit_hour: null, limit_person: null, paused_until: null, pause_reason: null, pause_detail: null, pause_count: 0 });
  });
  test('the counted emails are kept seven days: what is older goes, the rest stays', async () => {
    const w = world({ sends: [...mailed(3, ago(7 * DAY + 1)), ...mailed(1, ago(7 * DAY)), ...mailed(2, ago(6 * DAY)), ...mailed(1, ago(30 * DAY), { from_email: 'other@firma.de' })] });
    assert.equal(await sends.trim(w.pool, NOW), 4);
    assert.deepEqual(w.w.sends.map(s => s.sent_at.toISOString()), [ago(7 * DAY), ago(6 * DAY), ago(6 * DAY)].map(d => d.toISOString()));
    assert.equal(sends.KEEP_DAYS, 7);
    assert.ok(sends.KEEP_DAYS * DAY > DAY, 'never shorter than the longest time that is counted');
  });
});

describe('what the page is told about sending', () => {
  test('the kind of address, Google\'s own limit, what holds now, the defaults, the most that may be set, what went out — and a pause while it lasts', async () => {
    const w = world({ conn: { limit_day: 800, paused_until: in_(2 * HOUR), pause_reason: 'google_limit', pause_detail: 'User-rate limit exceeded.', pause_count: 2 }, sends: [...mailed(5, ago(3 * HOUR), { contact_id: 40 }), ...mailed(2, ago(MIN), { kind: 'test' })] });
    assert.deepEqual(sends.sendingOf(await sends.read(w.pool, WS, { now: NOW })), {
      kind: 'workspace', google_day: 2000, limits: { day: 800, hour: 150, person: 3 }, defaults: { day: 1500, hour: 150, person: 3 }, max: { day: 2000, hour: 2000, person: 20 },
      sent: { day: 7, hour: 2 }, paused_until: '2026-11-20T12:00:00.000Z', pause_reason: 'google_limit', pause_detail: 'User-rate limit exceeded.' });
  });
  test('nothing paused, or a pause that is over: three times null; no connection: nothing at all', async () => {
    const calm = sends.sendingOf(await sends.read(world().pool, WS, { now: NOW }));
    assert.deepEqual([calm.paused_until, calm.pause_reason, calm.pause_detail, calm.sent], [null, null, null, { day: 0, hour: 0 }]);
    const over = sends.sendingOf(await sends.read(world({ conn: { paused_until: ago(MIN), pause_reason: 'google_limit', pause_detail: 'x', pause_count: 1 } }).pool, WS, { now: NOW }));
    assert.deepEqual([over.paused_until, over.pause_reason, over.pause_detail], [null, null, null]);
    assert.equal(await sends.read(world().pool, OTHER, { now: NOW }), null);
    assert.equal(sends.sendingOf(null), null);
  });
  test('a personal address says so, with its own numbers', async () => {
    const s = sends.sendingOf(await sends.read(world({ conn: { email: 'Max@Gmail.com' } }).pool, WS, { now: NOW }));
    assert.deepEqual([s.kind, s.google_day, s.limits, s.max], ['personal', 500, { day: 400, hour: 40, person: 3 }, { day: 500, hour: 500, person: 20 }]);
  });
});

describe('the lines that carry it', () => {
  const src = read('utils/journey-sends.js'), code = src.replace(/\/\*[\s\S]*?\*\//, '');   // the code without its header
  const statements = [...code.matchAll(/pool\.query\(\s*(?:`([^`]*)`|'((?:[^'\\]|\\.)*)')/g)].map(m => (m[1] || m[2]).replace(/\s+/g, ' ').trim());
  test('it never opens the database module or the notifications itself: both are handed in', () => {
    assert.doesNotMatch(code, /require\(/);
  });
  test('the stand-in these tests use knows every statement of the file, as it is written', () => {
    assert.deepEqual([...statements].sort(), Object.values(SQL).sort());
    assert.equal(statements.length, 15);
  });
  test('every statement names the workspace or the address — but the one that deletes what is old', () => {
    const across = statements.filter(s => !/workspace_id = \$1|workspace_id = ANY\(\$1::int\[\]\)|VALUES \(\$1,\$2|from_email = \$1|LOWER\((m\.)?email\) = \$1/.test(s));
    assert.deepEqual(across, ['DELETE FROM journey_sends WHERE sent_at < $1']);
    for (const s of statements) assert.doesNotMatch(s, /\$\{/, 'only fixed text is a statement');
  });
  test('a count is over a rolling time, by the address in small letters; the pause is the latest any workspace of the address has', () => {
    assert.match(code, /new Date\(at - DAY_MS\), new Date\(at - HOUR_MS\), contactId\]/);
    assert.match(code, /WHERE s\.from_email = LOWER\(m\.email\) AND s\.sent_at > \$2\) AS sent_day/);
    assert.match(code, /WHERE s\.from_email = LOWER\(m\.email\) AND s\.sent_at > \$3\) AS sent_hour/);
    assert.match(code, /s\.kind = 'step' AND s\.contact_id = \$4 AND s\.sent_at > \$2\) AS sent_person/);
    assert.match(code, /WHERE LOWER\(a\.email\) = LOWER\(m\.email\) ORDER BY a\.paused_until DESC NULLS LAST, a\.pause_count DESC LIMIT 1/);
    assert.match(code, /if \(state\.paused_until\) return \{ ok: false, why: 'paused', until: state\.paused_until, state \};\s+if \(state\.sent\.day >= state\.limits\.day\) return no\('limit_day', state\.limits\.day, DAY_MS\);\s+if \(test\) return \{ ok: true, state \};\s+if \(state\.sent\.hour >= state\.limits\.hour\) return no\('limit_hour', state\.limits\.hour, HOUR_MS\);/);
    assert.deepEqual(sends.WAITS, ['paused', 'limit_day', 'limit_hour', 'limit_person']);
  });
  test('a pause is written only where none is in force, and lifted by a sent email only where none is', () => {
    assert.match(code, /WHERE LOWER\(email\) = \$1 AND \(paused_until IS NULL OR paused_until <= \$5\) RETURNING workspace_id/);
    assert.match(code, /pause_count = 0\s+WHERE LOWER\(email\) = \$1 AND \(paused_until IS NULL OR paused_until <= \$2\)/);
    assert.match(code, /if \(!rows\.length\) return \{ until, fresh: false \};/);
  });
});
