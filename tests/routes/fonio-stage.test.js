// ROUTE tests: the deal after the call (FONIO_CHANGES Part 39).
//
// The workspace keeps a table per pipeline: what came out of the call → the stage the deal goes to and its urgency
// (each may stay "as it is"). What came out is
//   - lead_status, a variable of the workspace's own that fonio's assistant fills: interested, meeting_booked,
//     callback, not_interested or wrong_person (read forgivingly, German words too; anything else moves nothing);
//   - else a meeting agreed or a callback planned, known from the variables there already are;
//   - else "not reached", which the CRM decides itself: the call ended unanswered and no further try is planned.
// A deal is moved only while it is still in the stage it had when the call went out, once per call, and the move
// counts as a normal stage change (everyone told, the Engine hears of a trigger stage).
//
// Here: the reader, the table's shape, which event a finished call is, the real applyAfterCall / sweepNotReached
// with a small fake database, the note's line, and the columns. The settings route and the receiver are in
// fonio-settings.test.js and fonio-receive.test.js; a real database run is in FONIO_CHANGES Part 39.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const fonioResult = require('../../utils/fonio-result');
const fonioStage = require('../../utils/fonio-stage');

describe('lead_status: what the assistant wrote', () => {
  const of = v => fonioResult.readLeadStatus({ lead_status: v });

  test('the five words, as asked for', () => {
    for (const w of ['interested', 'meeting_booked', 'callback', 'not_interested', 'wrong_person']) assert.equal(of(w), w);
  });
  test('capitals, spaces, dashes and a full stop do not matter', () => {
    assert.equal(of(' Interested. '), 'interested');
    assert.equal(of('Not interested'), 'not_interested');
    assert.equal(of('meeting-booked'), 'meeting_booked');
    assert.equal(of('WRONG PERSON'), 'wrong_person');
  });
  test('"not interested" is never read as "interested"', () => {
    for (const w of ['not_interested', 'not interested', 'no interest', 'uninterested', 'kein Interesse', 'nicht interessiert']) assert.equal(of(w), 'not_interested', w);
  });
  test('German words', () => {
    assert.equal(of('interessiert'), 'interested');
    assert.equal(of('Termin vereinbart'), 'meeting_booked');
    assert.equal(of('Rückruf'), 'callback');
    assert.equal(of('Rueckruf gewünscht'), 'callback');
    assert.equal(of('falsche Nummer'), 'wrong_person');
    assert.equal(of('falscher Ansprechpartner'), 'wrong_person');
  });
  test('near misses an assistant writes', () => {
    assert.equal(of('wrong number'), 'wrong_person');
    assert.equal(of('appointment booked'), 'meeting_booked');
    assert.equal(of('call back later'), 'callback');
  });
  test('empty, a variable fonio did not fill, and anything it cannot be sure of: nothing', () => {
    for (const w of ['', '   ', '{{lead_status}}', '<lead_status>', 'unknown', 'maybe', 'not reached', 'answered', 'yes', '42']) assert.equal(of(w), null, JSON.stringify(w));
    assert.equal(fonioResult.readLeadStatus({}), null);
    assert.equal(fonioResult.readLeadStatus(null), null);
  });
  test('the field can be named in camel case or in German', () => {
    assert.equal(fonioResult.readLeadStatus({ leadStatus: 'callback' }), 'callback');
    assert.equal(fonioResult.readLeadStatus({ gespraechsergebnis: 'interessiert' }), 'interested');
  });
  test('it is not mixed up with call_outcome, and readResult carries both', () => {
    const r = fonioResult.readResult({ call_outcome: 'answered', lead_status: 'not_interested' }, '+4930123456');
    assert.deepEqual([r.outcome, r.leadStatus], ['answered', 'not_interested']);
    assert.equal(fonioResult.readResult({ outcome: 'interested' }, '+4930123456').leadStatus, null, 'call_outcome\'s names are not lead_status\'s');
    assert.equal(fonioResult.readResult({}, '+4930123456').leadStatus, null);
  });
  test('the reader knows exactly the words the table has lines for', () => {
    assert.deepEqual(fonioResult.LEAD_STATUSES, fonioStage.STATUSES);
    assert.deepEqual(fonioStage.EVENTS, [...fonioStage.STATUSES, 'not_reached']);
  });
});

describe('which line of the table a finished call falls under', () => {
  const ev = fonioStage.eventOf;
  test('what the assistant wrote comes first', () => {
    assert.equal(ev({ leadStatus: 'not_interested', meeting: true, callback: true, outcome: 'no_answer' }), 'not_interested');
    assert.equal(ev({ leadStatus: 'interested', outcome: 'answered' }), 'interested');
  });
  test('without it: a meeting agreed, then a callback planned, from the variables there already are', () => {
    assert.equal(ev({ meeting: true, callback: true, outcome: 'answered' }), 'meeting_booked');
    assert.equal(ev({ callback: true, outcome: 'answered' }), 'callback');
  });
  test('not reached: the call ended unanswered and no further try is planned', () => {
    for (const outcome of ['no_answer', 'voicemail', 'busy']) {
      assert.equal(ev({ outcome, retry: false }), 'not_reached', outcome);
      assert.equal(ev({ outcome, retry: true }), null, `${outcome}: a retry is planned, so this was not the last try`);
    }
  });
  test('answered with nothing said about the result, or nothing known at all: no line', () => {
    assert.equal(ev({ outcome: 'answered' }), null);
    assert.equal(ev({}), null);
    assert.equal(ev({ leadStatus: 'not_reached', outcome: null }), null, 'not_reached is never taken from the assistant');
    assert.equal(ev({ leadStatus: 'whatever' }), null);
  });
});

describe('checkRules: the table as it is saved', () => {
  const ok = v => fonioStage.checkRules(v).value;
  test('nothing is an empty table', () => {
    assert.deepEqual(ok(null), {}); assert.deepEqual(ok(undefined), {}); assert.deepEqual(ok({}), {});
  });
  test('pipeline → event → { stage_id, urgency }, each null for "leave as it is"', () => {
    assert.deepEqual(ok({ 1: { interested: { stage_id: 12, urgency: 3 }, not_reached: { stage_id: 14, urgency: null }, not_interested: { urgency: 0 } } }),
      { 1: { interested: { stage_id: 12, urgency: 3 }, not_reached: { stage_id: 14, urgency: null }, not_interested: { stage_id: null, urgency: 0 } } });
  });
  test('a line that leaves both as they are is no line; a pipeline without lines is dropped', () => {
    assert.deepEqual(ok({ 1: { interested: { stage_id: null, urgency: null }, callback: null }, 2: { callback: { stage_id: 9 } } }), { 2: { callback: { stage_id: 9, urgency: null } } });
  });
  test('urgency 0 is a value ("No urgency"), not "leave as it is"', () => {
    assert.deepEqual(ok({ 1: { wrong_person: { urgency: 0 } } }), { 1: { wrong_person: { stage_id: null, urgency: 0 } } });
  });
  test('refused: a wrong shape, an unknown event, ids and urgencies that are not what they should be', () => {
    for (const bad of ['x', 5, [], { x: {} }, { 0: {} }, { 1: [] }, { 1: 'x' }, { 1: { reached: { stage_id: 1 } } }, { 1: { interested: 'x' } }, { 1: { interested: [] } },
      { 1: { interested: { stage_id: '12' } } }, { 1: { interested: { stage_id: 0 } } }, { 1: { interested: { stage_id: 1.5 } } },
      { 1: { interested: { urgency: 5 } } }, { 1: { interested: { urgency: -1 } } }, { 1: { interested: { urgency: '3' } } }]) {
      const r = fonioStage.checkRules(bad);
      assert.ok(r.error && !('value' in r), JSON.stringify(bad));
    }
  });
});

// ── the real applyAfterCall and sweepNotReached, with a small fake database ──
const WS = 7;
const db = {};
const pool = {
  query: async (sql, p = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    db.log.push({ sql: t, params: p });
    if (t === 'SELECT stage_rules FROM workspace_fonio WHERE workspace_id = $1') return { rows: db.conn && p[0] === WS ? [{ stage_rules: db.conn.stage_rules }] : [] };
    if (t.startsWith('UPDATE fonio_calls SET stage_rule_at = NOW(), stage_event = $3 WHERE id = $1 AND workspace_id = $2 AND stage_rule_at IS NULL')) {
      const c = db.calls.get(p[0]); if (!c || p[1] !== WS || c.stage_rule_at) return { rows: [] };
      c.stage_rule_at = new Date(); c.stage_event = p[2];
      return { rows: [{ id: c.id, deal_id: c.deal_id, contact_id: c.contact_id, stage_at_send: c.stage_at_send }] };
    }
    if (t === 'SELECT id, title, contact_id, pipeline_id, stage_id, urgency FROM deals WHERE id = $1 AND workspace_id = $2') {
      const d = db.deals.get(p[0]); return { rows: d && p[1] === WS ? [{ ...d }] : [] };
    }
    if (t === 'SELECT id, name FROM pipeline_stages WHERE id = $1 AND pipeline_id = $2 AND workspace_id = $3') {
      const s = db.stages.find(x => x.id === p[0] && x.pipeline_id === p[1]); return { rows: s && p[2] === WS ? [{ id: s.id, name: s.name }] : [] };
    }
    if (t.startsWith('UPDATE deals SET stage_id = COALESCE($3, stage_id), urgency = COALESCE($4, urgency), updated_at = NOW() WHERE id = $1 AND workspace_id = $2 AND stage_id IS NOT DISTINCT FROM $5')) {
      const d = db.deals.get(p[0]); if (!d || p[1] !== WS || (d.stage_id ?? null) !== (p[4] ?? null) || db.raceMove) return { rowCount: 0, rows: [] };
      if (p[2] != null) d.stage_id = p[2]; if (p[3] != null) d.urgency = p[3];
      return { rowCount: 1, rows: [] };
    }
    if (t.startsWith('SELECT f.id, f.workspace_id, f.contact_id, f.deal_id, f.follow_up_no, w.follow_up, w.active, w.hours_tz FROM fonio_calls f JOIN workspace_fonio w')) {
      return { rows: db.unreported.map(c => ({ ...c, workspace_id: WS, follow_up: db.conn.follow_up, active: db.conn.active, hours_tz: 'Europe/Berlin' })) };
    }
    if (t.startsWith("INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source) VALUES ($1,$2,$3,'note',$4,NULL,'fonio')")) {
      db.notes.push({ contact_id: p[1], deal_id: p[2], content: p[3] }); return { rows: [{ id: 900 + db.notes.length }] };
    }
    if (t === 'SELECT id FROM users WHERE workspace_id = $1') return { rows: [{ id: 1 }, { id: 2 }] };
    throw new Error(`unexpected statement: ${t}`);
  },
};
beforeEach(() => {
  db.log = []; db.notes = []; db.unreported = []; db.raceMove = false;
  db.conn = { active: true, follow_up: { enabled: false }, stage_rules: { 1: {
    interested: { stage_id: 12, urgency: 3 }, meeting_booked: { stage_id: 13, urgency: null }, not_interested: { stage_id: 15, urgency: 0 },
    not_reached: { stage_id: 14, urgency: 1 }, wrong_person: { stage_id: null, urgency: 0 } } } };
  db.stages = [11, 12, 13, 14, 15].map(id => ({ id, pipeline_id: 1, name: { 11: 'New', 12: 'Qualified', 13: 'Meeting planned', 14: 'Not reached', 15: 'Lost' }[id] }))
    .concat([{ id: 21, pipeline_id: 2, name: 'Partner new' }]);
  db.deals = new Map([
    [100, { id: 100, title: 'Erika Muster', contact_id: 10, pipeline_id: 1, stage_id: 11, urgency: 0 }],
    [101, { id: 101, title: 'Partner deal', contact_id: 11, pipeline_id: 2, stage_id: 21, urgency: 2 }],
  ]);
  db.calls = new Map([
    [1, { id: 1, deal_id: 100, contact_id: 10, stage_at_send: 11, stage_rule_at: null }],
    [2, { id: 2, deal_id: 101, contact_id: 11, stage_at_send: 21, stage_rule_at: null }],
    [3, { id: 3, deal_id: null, contact_id: 10, stage_at_send: 0, stage_rule_at: null }],
    [4, { id: 4, deal_id: 100, contact_id: 10, stage_at_send: null, stage_rule_at: null }],   // sent before the stage was kept
  ]);
});
const apply = (callId, event) => fonioStage.applyAfterCall(pool, WS, callId, event);
const wrote = () => db.log.filter(q => q.sql.startsWith('UPDATE deals'));

describe('applyAfterCall: the deal follows its pipeline\'s line', () => {
  test('stage and urgency: the deal moves, and the answer says from where to where', async () => {
    const r = await apply(1, 'interested');
    assert.equal(r.status, 'applied'); assert.equal(r.event, 'interested');
    assert.deepEqual(r.stage, { id: 12, name: 'Qualified' }); assert.equal(r.urgency, 3); assert.equal(r.from_stage, 11);
    assert.deepEqual([db.deals.get(100).stage_id, db.deals.get(100).urgency], [12, 3]);
    assert.equal(db.calls.get(1).stage_event, 'interested', 'kept on the call');
  });
  test('"leave as it is" for the urgency keeps the deal\'s own', async () => {
    db.deals.get(100).urgency = 4;
    const r = await apply(1, 'meeting_booked');
    assert.deepEqual([r.status, r.stage.id, r.urgency], ['applied', 13, null]);
    assert.deepEqual([db.deals.get(100).stage_id, db.deals.get(100).urgency], [13, 4]);
  });
  test('"leave as it is" for the stage sets the urgency only; 0 is a real value', async () => {
    db.deals.get(100).urgency = 3;
    const r = await apply(1, 'wrong_person');
    assert.deepEqual([r.status, r.stage, r.urgency], ['applied', null, 0]);
    assert.deepEqual([db.deals.get(100).stage_id, db.deals.get(100).urgency], [11, 0]);
  });
  test('the deal is already where the line says: nothing is written', async () => {
    Object.assign(db.deals.get(100), { stage_id: 12, urgency: 3 }); db.calls.get(1).stage_at_send = 12;
    const r = await apply(1, 'interested');
    assert.equal(r.status, 'unchanged');
    assert.deepEqual(wrote(), []);
  });
  test('somebody moved the deal since the call went out: it is left alone', async () => {
    db.deals.get(100).stage_id = 13;
    const r = await apply(1, 'interested');
    assert.equal(r.status, 'moved_by_hand');
    assert.deepEqual(wrote(), []);
    assert.deepEqual([db.deals.get(100).stage_id, db.deals.get(100).urgency], [13, 0], 'neither stage nor urgency');
  });
  test('moved in the instant between the look and the write: the write itself refuses', async () => {
    db.raceMove = true;
    assert.equal((await apply(1, 'interested')).status, 'moved_by_hand');
    assert.match(wrote()[0].sql, /AND stage_id IS NOT DISTINCT FROM \$5$/);
  });
  test('a deal without a stage when the call went out (kept as 0) moves when it still has none', async () => {
    db.deals.get(100).stage_id = null; db.calls.get(1).stage_at_send = 0;
    assert.equal((await apply(1, 'interested')).status, 'applied');
    assert.equal(db.deals.get(100).stage_id, 12);
  });
  test('once per call: a second look does nothing', async () => {
    assert.equal((await apply(1, 'interested')).status, 'applied');
    db.calls.get(1).stage_at_send = 12;
    assert.equal(await apply(1, 'not_interested'), null);
    assert.equal(db.deals.get(100).stage_id, 12);
  });
  test('no line for this event, or for this pipeline: nothing', async () => {
    assert.equal(await apply(1, 'callback'), null);
    assert.equal(await apply(2, 'interested'), null);
    assert.deepEqual(wrote(), []);
  });
  test('the stage the line names is gone, or belongs to another pipeline: the deal stays, and the answer says why', async () => {
    db.conn.stage_rules[1].interested.stage_id = 99;
    assert.equal((await apply(1, 'interested')).status, 'stage_gone');
    db.conn.stage_rules[2] = { interested: { stage_id: 12, urgency: null } };   // 12 is a stage of pipeline 1
    assert.equal((await apply(2, 'interested')).status, 'stage_gone');
    assert.deepEqual(wrote(), []);
  });
  test('no table at all: nothing is even claimed', async () => {
    db.conn.stage_rules = {};
    assert.equal(await apply(1, 'interested'), null);
    assert.equal(db.calls.get(1).stage_rule_at, null);
    assert.equal(db.log.length, 1, 'one look at the connection, nothing else');
  });
  test('no event, a call without a deal, a call sent before the stage was kept, a deal that is gone: nothing', async () => {
    assert.equal(await apply(1, null), null);
    assert.equal(db.log.length, 0, 'no event costs no query');
    assert.equal(await apply(3, 'interested'), null);
    assert.equal(await apply(4, 'interested'), null);
    db.deals.delete(101);
    assert.equal(await apply(2, 'interested'), null);
    assert.deepEqual(wrote(), []);
  });
  test('every statement names the workspace', async () => {
    await apply(1, 'interested');
    for (const q of db.log) assert.ok(q.params.includes(WS), q.sql);
  });
});

describe('the note\'s last line', () => {
  const line = fonioStage.noteLine;
  const deal = { id: 100, title: 'Erika Muster' };
  test('moved, with and without the urgency', () => {
    assert.equal(line({ event: 'interested', status: 'applied', deal, stage: { id: 12, name: 'Qualified' }, urgency: 3 }), 'Deal nach „Qualified“ verschoben, Dringlichkeit: Hoch (Ergebnis: interessiert).');
    assert.equal(line({ event: 'meeting_booked', status: 'applied', deal, stage: { id: 13, name: 'Meeting planned' }, urgency: null }), 'Deal nach „Meeting planned“ verschoben (Ergebnis: Termin vereinbart).');
  });
  test('only the urgency', () => {
    assert.equal(line({ event: 'wrong_person', status: 'applied', deal, stage: null, urgency: 0 }), 'Dringlichkeit des Deals: Keine Dringlichkeit (Ergebnis: falsche Person).');
  });
  test('not moved, with the reason', () => {
    assert.equal(line({ event: 'not_reached', status: 'moved_by_hand', deal }), 'Deal nicht verschoben: Er wurde seit dem Anruf bereits verschoben (Ergebnis: nicht erreicht).');
    assert.equal(line({ event: 'callback', status: 'stage_gone', deal }), 'Deal nicht verschoben: Die eingestellte Phase gibt es nicht mehr (Ergebnis: Rückruf gewünscht).');
  });
  test('nothing changed, or nothing happened: no line', () => {
    assert.equal(line({ event: 'interested', status: 'unchanged', deal }), '');
    assert.equal(line(null), '');
  });
  test('every event and every urgency has its German word', () => {
    for (const e of fonioStage.EVENTS) assert.ok(fonioStage.EVENT_WORDS[e], e);
    assert.equal(fonioStage.URGENCY_WORDS.length, 5);
    const de = new Function(require('../helpers/client-fn').sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))().de;
    assert.deepEqual(fonioStage.URGENCY_WORDS, [0, 1, 2, 3, 4].map(n => de['urg_' + n]), 'the words the app itself shows');
  });
});

describe('tellMoved: a move by fonio counts as a normal stage change', () => {
  const deal = { id: 100, title: 'Erika Muster', contact_id: 10 };
  const moved = { event: 'interested', status: 'applied', deal, from_stage: 11, stage: { id: 12, name: 'Qualified' }, urgency: null };
  const recorder = () => { const seen = { told: [], engine: [] }; return { seen,
    notifyUser: async (wid, actor, uid, n) => { seen.told.push({ wid, actor, uid, ...n }); return true; },
    engine: { stageNum: v => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null), dispatchContractSigned: async a => { seen.engine.push(a); } } }; };

  test('every member is told, with the same kind of notification as a move by hand, and no acting user', async () => {
    const r = recorder();
    await fonioStage.tellMoved(pool, WS, moved, { notifyUser: r.notifyUser, engine: r.engine });
    assert.deepEqual(r.seen.told, [1, 2].map(uid => ({ wid: WS, actor: null, uid, type: 'deal_stage_changed', category: 'deals', title: 'Deal stage changed: Erika Muster', body: 'fonio: Qualified', entityType: 'deal', entityId: 100 })));
    assert.match(read('routes/deals.js'), /type: 'deal_stage_changed', category: 'deals',\s*title: `Deal stage changed: \$\{before\.title\}`/, 'the words of the move by hand');
  });
  test('the Engine hears of the new stage, with the workspace\'s clock and the address it was reached at', async () => {
    const r = recorder();
    await fonioStage.tellMoved(pool, WS, moved, { notifyUser: r.notifyUser, engine: r.engine, timezone: 'Europe/Berlin', baseUrl: 'https://crm.example' });
    assert.deepEqual(r.seen.engine, [{ workspaceId: WS, dealId: 100, contactId: 10, title: 'Erika Muster', stageId: 12, timezone: 'Europe/Berlin', baseUrl: 'https://crm.example' }]);
  });
  test('only the urgency changed, nothing changed, or the deal was left alone: nobody is told', async () => {
    const r = recorder();
    for (const res of [{ ...moved, stage: null, urgency: 3 }, { event: 'interested', status: 'unchanged', deal }, { event: 'interested', status: 'moved_by_hand', deal }, null]) {
      await fonioStage.tellMoved(pool, WS, res, { notifyUser: r.notifyUser, engine: r.engine });
    }
    assert.deepEqual(r.seen, { told: [], engine: [] });
  });
  test('a failure to tell never throws: the deal is moved already', async () => {
    await assert.doesNotReject(fonioStage.tellMoved(pool, WS, moved, { notifyUser: async () => { throw new Error('boom'); }, engine: null }));
  });
  test('this file never opens the database module or the notifications by itself', () => {
    const src = read('utils/fonio-stage.js');
    assert.doesNotMatch(src, /require\('\.\.\/(db|notifications)'\)|require\('\.\/engine'\)/);
  });
});

describe('sweepNotReached: a call fonio never reported, with no further try', () => {
  const sweep = () => fonioStage.sweepNotReached(pool, new Date('2026-11-18T12:00:00Z'));
  beforeEach(() => { db.unreported = [{ id: 1, contact_id: 10, deal_id: 100, follow_up_no: 0 }]; });

  test('retries off: the first call was the last try — the deal goes to "Not reached", and a note says why', async () => {
    const done = await sweep();
    assert.equal(done.length, 1); assert.equal(done[0].status, 'applied');
    assert.deepEqual([db.deals.get(100).stage_id, db.deals.get(100).urgency], [14, 1]);
    assert.deepEqual(db.notes, [{ contact_id: 10, deal_id: 100,
      content: 'fonio-Anruf · nicht erreicht\n\nfonio hat zu diesem Anruf kein Ergebnis geschickt, und ein weiterer Versuch ist nicht geplant.\n\nDeal nach „Not reached“ verschoben, Dringlichkeit: Niedrig (Ergebnis: nicht erreicht).' }]);
  });
  test('retries on and tries left: the retry comes first, the deal is not touched', async () => {
    db.conn.follow_up = { enabled: true, max_attempts: 1 };
    assert.deepEqual(await sweep(), []);
    assert.equal(db.deals.get(100).stage_id, 11);
    assert.equal(db.calls.get(1).stage_rule_at, null, 'not claimed: it is looked at again once the tries are used up');
  });
  test('retries on and all tries used up ("called twice and no answer"): not reached', async () => {
    db.conn.follow_up = { enabled: true, max_attempts: 1 };
    db.unreported = [{ id: 1, contact_id: 10, deal_id: 100, follow_up_no: 1 }];
    assert.equal((await sweep()).length, 1);
    assert.equal(db.deals.get(100).stage_id, 14);
  });
  test('moved by hand meanwhile: left alone, and no note either', async () => {
    db.deals.get(100).stage_id = 13;
    assert.deepEqual((await sweep()).map(r => r.status), ['moved_by_hand']);
    assert.deepEqual(db.notes, []);
  });
  test('the query: sent, no result, no retry booked, not looked at yet, between an hour and a day old, a link that has delivered, a table that is not empty', () => {
    const src = read('utils/fonio-stage.js');
    assert.match(src, /f\.status = 'sent' AND f\.result_at IS NULL AND f\.follow_up_at IS NULL AND f\.stage_rule_at IS NULL AND f\.sent_at IS NOT NULL/);
    assert.match(src, /f\.sent_at < \$1 AND f\.sent_at > \$3 AND w\.last_delivery IS NOT NULL AND w\.stage_rules <> '\{\}'::jsonb/);
  });
  test('the worker runs it after the retries, and a failure there never holds the due calls back', () => {
    const src = read('utils/fonio-calls.js');
    const i = src.indexOf('await sweepUnreported(pool, now, limit)'), j = src.indexOf("require('./fonio-stage').sweepNotReached(pool, now, limit, tell)");
    assert.ok(i > 0 && j > i, 'after the retry sweep');
    assert.match(src, /try \{ await require\('\.\/fonio-stage'\)\.sweepNotReached\(pool, now, limit, tell\); \}\s*catch \(err\) \{ console\.error\(/);
    assert.match(read('server.js'), /startWorker\(pool, \{ tell: \{ notifyUser: require\('\.\/notifications'\)\.notifyUser, engine: require\('\.\/utils\/engine'\) \} \}\)/, 'server.js hands in who is told');
  });
  test('a deal the worker moves is told like any other', async () => {
    const told = [];
    await fonioStage.sweepNotReached(pool, new Date('2026-11-18T12:00:00Z'), 20, { notifyUser: async (wid, actor, uid, n) => { told.push([uid, n.type, n.body]); return true; } });
    assert.deepEqual(told, [[1, 'deal_stage_changed', 'fonio: Not reached'], [2, 'deal_stage_changed', 'fonio: Not reached']]);
  });
});

describe('the stage is kept when the call goes out', () => {
  test('sendCall stamps it as the call is sent; 0 stands for "no stage", NULL for a call from before', () => {
    const src = read('utils/fonio-calls.js');
    assert.match(src, /UPDATE fonio_calls f SET stage_at_send = COALESCE\(\(SELECT d\.stage_id FROM deals d WHERE d\.id = f\.deal_id\), 0\) WHERE f\.id = \$1/);
    const send = src.slice(src.indexOf('async function sendCall('), src.indexOf('async function runDue('));
    assert.ok(send.indexOf('stage_at_send') < send.indexOf("return done('sent'"), 'before the call is marked sent');
    assert.ok(send.indexOf('stage_at_send') > send.indexOf('fonio.outboundCall('), 'only once fonio has taken the call');
  });
});

describe('db.js', () => {
  const src = read('db.js');
  test('the table on the connection, empty until something is set', () => {
    assert.match(src, /ALTER TABLE workspace_fonio ADD COLUMN IF NOT EXISTS stage_rules JSONB NOT NULL DEFAULT '\{\}'::jsonb`\)/);
  });
  test('on the call: the stage when it went out, and the one look at the table', () => {
    assert.match(src, /ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS stage_at_send INTEGER`\)/);
    assert.match(src, /ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS stage_rule_at TIMESTAMPTZ`\)/);
    assert.match(src, /ALTER TABLE fonio_calls ADD COLUMN IF NOT EXISTS stage_event TEXT`\)/);
  });
});
