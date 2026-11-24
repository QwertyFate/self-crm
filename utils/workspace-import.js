/* ═══════════════════════════════════════════════════════════════════════════
   WORKSPACE IMPORT — the DATA of an export (utils/workspace-export.js) brought
   INTO A WORKSPACE that exists here, from the admin console only
   (WORKSPACE_IMPORT_CHANGES Part 1, 2026-11-24; routes/admin-transfer.js).

   WHAT COMES IN: contacts, deals, notes and other activities with their
   comments — and how they hang together (a deal's contact, a note's deal).
   With them, because they would not make sense without: the pipelines and
   stages the deals are in, and the custom fields their values belong to.
   WHAT DOES NOT: the owner, the team (nobody's account, nobody's password),
   the workspace's settings, connections, workflows, tasks, listings,
   templates, documents. Who something was assigned to, and who wrote a note,
   therefore does not travel either: it arrives unassigned.

   THE RULE: AN IMPORT ONLY ADDS. Nothing that is in the database is replaced,
   changed or deleted by it — not in the workspace it goes into, not in any
   other. That is why
     · NO ROW KEEPS ITS ID. The ids in an export are the ids of the install it
       came from; here the same numbers belong to other rows, of other
       workspaces. Every row gets a new id of this database's own, and while
       the import runs it keeps, per table, what each old id became
       (old → new). A row that points to another one (a deal to its contact)
       is written with what that id became — never with the number from the
       file.
     · WHAT IS THERE ALREADY IS LEFT AS IT IS, and used:
         a contact with the same email address   the file's contact is not
             made a second time; its deals and notes are attached to the
             contact that is here, whose own row is not touched
         a custom field with the same key        the field that is here
             stays as it is; the values arrive under that key
         a pipeline with the same name           the file's pipeline arrives
             beside it under another name ("… (imported)"); the one that is
             here gets no stage and no deal from the file
     · IT STANDS OR FALLS AS ONE: run() writes everything inside one
       transaction. Whatever goes wrong — also in the last row — nothing of
       the file is in the database afterwards.
     · NOT TWICE. The same file is not imported into the same workspace a
       second time (workspace_imports remembers it): its deals and notes
       would be there twice.
     · NOTHING IS SET OFF. A workspace whose workflows are switched on is not
       imported into (a blocker of the check): its workflows would take the
       arriving deals for new ones and write to their contacts. Switched on
       AFTER an import, a workflow only sees what happens from then on — that
       is the workflows' own rule. Nothing else is told of an imported row:
       no call is planned, the Engine hears nothing, nobody is notified.

   THE CHECK WRITES NOTHING (Part 1): readBundle() opens the file, schemaOf()
   reads what this database's tables look like, targetOf() what the workspace
   already has, and plan() says what an import would add — per kind of row how
   many, how many are here already, how many are left out and why.
   THE IMPORT (Part 2) is run(): it decides once more, inside its transaction
   and with the workspace's row held, by the very same decide() the check
   used — what the check said is what the import does — and writes each row
   that arrives with INSERT … RETURNING id: the database gives the id. The
   only statements it has are that INSERT into the eight data tables and one
   INSERT into workspace_imports, the record of what was brought in.

   WHAT A ROW POINTS TO is not written down here: it is read from this
   database's own foreign keys (schemaOf), so a column added later is followed
   without anyone remembering to add it to a list. plan() walks the tables in
   the export's order (everything a row points to stands above it):
     points to a row that arrives or is here   → written with that row's id
     points to a person                        → emptied (people do not travel)
     points to anything else that is not there → the column may be empty: it
                                                 is emptied; it may not: the
                                                 row is left out, and so is
                                                 what points to IT
   A note that would be left with neither its contact nor its deal is left out.
   What belongs to the install the file came from is not carried over
   (NOT_CARRIED): a contact's Drive folder and Engine state, a meeting's
   booking at Cal.com or Calendly.

   Nothing here opens the database module; only run() writes, and only by INSERT.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const zlib = require('zlib');
const { readTar, collect } = require('./tar');
const { FORMAT, VERSION, TABLES } = require('./workspace-export');

const MAX_BYTES = 300 * 1024 * 1024;   // what an export may be once it is unpacked
// The tables whose rows come in, in the export's order (everything a row points to stands above it).
const DATA = ['custom_fields', 'deal_fields', 'pipelines', 'pipeline_stages', 'contacts', 'deals', 'activities', 'activity_comments'];
// Columns that belong to the install the file came from: not carried over (the column's own default stands).
const NOT_CARRIED = {
  contacts: ['drive_ordner_id', 'akte_version', 'onboarding_status', 'stage_id'],   // the Engine's folder and state there; stage_id is of a table that is no longer used
  activities: ['calcom_uid', 'calcom_event_type_id', 'calendly_uri', 'calendly_event_uri'],   // a booking at the other install's Cal.com / Calendly account
};
const PEOPLE = 'users';   // what a row says about a person is emptied: people do not travel
if (DATA.some(t => !TABLES.some(([name]) => name === t))) throw new Error('workspace-import: a data table is not in the export');

class ImportError extends Error {
  constructor(code, message) { super(message); this.name = 'ImportError'; this.code = code; }
}
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// The file as it was downloaded (.tar.gz) → the bundle. ImportError: not_gzip, too_big, not_bundle (no
// workspace.json in it, or that is no JSON), format (not a bundle of this CRM), version (newer than this install
// reads), shape (its tables are not what a bundle's are).
async function readBundle(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new ImportError('not_gzip', 'The file is empty.');
  let tar;
  try { tar = zlib.gunzipSync(bytes, { maxOutputLength: MAX_BYTES }); }
  catch (err) { throw err && err.code === 'ERR_BUFFER_TOO_LARGE' ? new ImportError('too_big', 'Unpacked, the file is larger than an export can be.') : new ImportError('not_gzip', 'The file is not a .tar.gz as the export makes it.'); }
  let json = null;
  try { for await (const entry of readTar([tar])) { if (entry.name === 'workspace.json') { json = await collect(entry.body); break; } } }
  catch { throw new ImportError('not_bundle', 'The file cannot be read as an export.'); }
  if (!json) throw new ImportError('not_bundle', 'There is no workspace.json in the file.');
  let bundle;
  try { bundle = JSON.parse(json.toString('utf8')); } catch { throw new ImportError('not_bundle', 'workspace.json is not JSON.'); }
  if (!isObject(bundle) || bundle.format !== FORMAT) throw new ImportError('format', 'The file is not a workspace export of this CRM.');
  if (!Number.isInteger(bundle.version) || bundle.version < 1 || bundle.version > VERSION) throw new ImportError('version', `The export is of version ${String(bundle.version).slice(0, 10)}; this install reads up to version ${VERSION}.`);
  const t = bundle.tables;
  if (!isObject(t) || Object.values(t).some(rows => !Array.isArray(rows) || rows.some(r => !isObject(r)))) throw new ImportError('shape', 'The export\'s tables are not lists of rows.');
  if (!Array.isArray(t.workspaces) || t.workspaces.length !== 1) throw new ImportError('shape', 'The export does not hold exactly one workspace.');
  return bundle;
}

// What this database's tables look like — read, never changed:
//   { <table>: { columns: { <name>: { nullable, has_default, json } }, refs: { <column>: <table it points to> } } }
async function schemaOf(pool, names = DATA) {
  const { rows: cols } = await pool.query(
    `SELECT table_name, column_name, is_nullable = 'YES' AS nullable, (column_default IS NOT NULL OR is_identity = 'YES') AS has_default,
            data_type IN ('json', 'jsonb') AS json
       FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, [names]
  );
  const { rows: fks } = await pool.query(
    `SELECT c.relname AS table_name, a.attname AS column_name, r.relname AS ref
       FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class r ON r.oid = k.confrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 1 AND n.nspname = current_schema() AND c.relname = ANY($1::text[])`, [names]
  );
  const schema = {};
  for (const c of cols) (schema[c.table_name] ||= { columns: {}, refs: {} }).columns[c.column_name] = { nullable: !!c.nullable, has_default: !!c.has_default, json: !!c.json };
  for (const f of fks) if (schema[f.table_name]) schema[f.table_name].refs[f.column_name] = f.ref;
  return schema;
}

const emailOf = row => (typeof row.email === 'string' ? row.email.trim().toLowerCase() : '');
const keyOf = row => (typeof row.field_key === 'string' ? row.field_key : '');
const nameKey = v => String(v || '').trim().toLowerCase();

// What the workspace the file goes into already has, as far as the file touches it — read, never changed:
//   { workspace: { id, name }, contacts: Map(email → { id, name }), custom_fields: Map(key → type),
//     deal_fields: Map(key → type), pipelines: Set(name, lower case), active_flows: [name], imported_at (when this
//     very file was brought into this workspace before, or null) } — or null when there
//   is no such workspace. pool: the pool, or the connection of the import's own transaction.
async function targetOf(pool, workspaceId, bundle) {
  const { rows: [workspace] } = await pool.query('SELECT id, name FROM workspaces WHERE id = $1', [workspaceId]);
  if (!workspace) return null;
  const emails = [...new Set((bundle.tables.contacts || []).map(emailOf).filter(Boolean))];
  const { rows: contacts } = emails.length ? await pool.query(
    'SELECT DISTINCT ON (lower(btrim(email))) id, name, lower(btrim(email)) AS email FROM contacts WHERE workspace_id = $1 AND lower(btrim(email)) = ANY($2::text[]) ORDER BY lower(btrim(email)), id', [workspaceId, emails]
  ) : { rows: [] };
  const { rows: custom } = await pool.query('SELECT field_key, type FROM custom_fields WHERE workspace_id = $1', [workspaceId]);
  const { rows: deal } = await pool.query('SELECT field_key, type FROM deal_fields WHERE workspace_id = $1', [workspaceId]);
  const { rows: pipelines } = await pool.query('SELECT name FROM pipelines WHERE workspace_id = $1', [workspaceId]);
  const { rows: flows } = await pool.query('SELECT name FROM journey_flows WHERE workspace_id = $1 AND active = true ORDER BY id', [workspaceId]);
  // the same file (the same export of the same workspace) brought into this workspace before
  const { rows: [before] } = await pool.query('SELECT created_at FROM workspace_imports WHERE workspace_id = $1 AND source_name = $2 AND exported_at = $3 ORDER BY id LIMIT 1',
    [workspaceId, String(bundle.workspace_name || '').slice(0, 200), typeof bundle.exported_at === 'string' ? bundle.exported_at.slice(0, 40) : '']);
  return { workspace: { id: workspace.id, name: workspace.name }, active_flows: flows.map(f => String(f.name)), imported_at: before ? before.created_at : null, contacts: new Map(contacts.map(c => [c.email, { id: c.id, name: c.name }])),
    custom_fields: new Map(custom.map(f => [f.field_key, f.type])), deal_fields: new Map(deal.map(f => [f.field_key, f.type])), pipelines: new Set(pipelines.map(p => nameKey(p.name))) };
}

// The name a pipeline of the file gets here: its own, or — where a pipeline of that name is here — with "(imported)".
function pipelineName(name, taken) {
  const base = String(name || 'Pipeline').trim() || 'Pipeline';
  if (!taken.has(nameKey(base))) return base;
  for (let n = 1; ; n++) { const tried = `${base} (imported${n > 1 ? ` ${n}` : ''})`; if (!taken.has(nameKey(tried))) return tried; }
}

// What an import of the file would add to the workspace — the ONE place that decides it, for the check and for the
// import alike. Writes nothing and asks nothing: schema from schemaOf(), target from targetOf().
//   { tables: [{ name, rows, adds, here, left_out }], unassigned, pipelines: [{ name, as }], not_included: [{ name, rows }],
//     warnings: [string], blockers: [string] }
//   adds: rows that would be made · here: rows that are here already and are used instead (never changed) ·
//   left_out: rows that would not arrive · unassigned: rows that name a person and arrive without one
//   steps (for run() only): the rows that will stand for something here, in the order they are written —
//   { t, row } to be made (a pipeline with `as`, its name here), or { t, row, here } for what is here already
//   (here: that contact's id)
function decide(bundle, schema, target) {
  const warnings = [], blockers = [], tables = [], pipelines = [], steps = [];
  if (target.imported_at) blockers.push(`This file was imported into this workspace before (${new Date(target.imported_at).toISOString().slice(0, 10)}). A second time, every deal and note in it would be there twice.`);
  const flowsOn = Array.isArray(target.active_flows) ? target.active_flows : [];
  if (flowsOn.length) blockers.push(`${flowsOn.length} workflow${flowsOn.length === 1 ? ' is' : 's are'} switched on in this workspace (${flowsOn.slice(0, 5).map(n => `"${n.slice(0, 60)}"`).join(', ')}${flowsOn.length > 5 ? ', …' : ''}). Switch ${flowsOn.length === 1 ? 'it' : 'them'} off in the workspace first: a running workflow would take the imported deals for new ones and write to their contacts. Switched on again afterwards, ${flowsOn.length === 1 ? 'it' : 'they'} only act${flowsOn.length === 1 ? 's' : ''} on what happens from then on.`);
  const kept = {};   // table → the file's ids that will stand for a row here (made, or here already)
  const rowsOf = t => (Array.isArray(bundle.tables[t]) ? bundle.tables[t] : []);
  const taken = new Set(target.pipelines);
  let unassigned = 0;
  for (const t of DATA) {
    const rows = rowsOf(t), s = schema[t];
    const out = { name: t, rows: rows.length, adds: 0, here: 0, left_out: 0 };
    kept[t] = new Set();
    tables.push(out);
    if (!rows.length) continue;
    if (!s) { out.left_out = rows.length; blockers.push(`This database has no table ${t}.`); continue; }
    const sample = rows[0], skip = NOT_CARRIED[t] || [];
    for (const [col, c] of Object.entries(s.columns)) if (!c.nullable && !c.has_default && !(col in sample)) blockers.push(`${t}.${col} is required here and the file has no such column: the file is older than this database expects.`);
    const dropped = Object.keys(sample).filter(col => !(col in s.columns));
    if (dropped.length) warnings.push(`${t}: ${dropped.length === 1 ? 'the column' : 'the columns'} ${dropped.slice(0, 8).join(', ')} ${dropped.length === 1 ? 'is' : 'are'} not known here and would be dropped.`);
    for (const row of rows) {
      // what is here already is used, and left as it is
      if ((t === 'custom_fields' || t === 'deal_fields') && !keyOf(row)) { out.left_out++; continue; }   // a field without a key is no field
      if ((t === 'custom_fields' || t === 'deal_fields') && target[t].has(keyOf(row))) {
        if (target[t].get(keyOf(row)) !== row.type) warnings.push(`The field "${keyOf(row).slice(0, 60)}" is here as ${target[t].get(keyOf(row))} and in the file as ${String(row.type).slice(0, 30)}. The field here stays as it is; the file's values arrive under it.`);
        out.here++; kept[t].add(row.id); steps.push({ t, row, here: true }); continue;
      }
      if (t === 'contacts' && emailOf(row) && target.contacts.has(emailOf(row))) { out.here++; kept[t].add(row.id); steps.push({ t, row, here: target.contacts.get(emailOf(row)).id }); continue; }
      let travels = true, person = false;
      for (const [col, ref] of Object.entries(s.refs)) {
        const v = row[col];
        if (v === null || v === undefined || col === 'workspace_id' || skip.includes(col)) continue;   // the workspace is the one it goes into
        if (ref === PEOPLE) { if (s.columns[col] && s.columns[col].nullable) { person = true; continue; } travels = false; break; }   // a row that cannot be without its person does not arrive
        const there = ref === t ? rows.some(r => r.id === v) : !!kept[ref] && kept[ref].has(v);
        if (there) continue;
        if (!(s.columns[col] && s.columns[col].nullable)) { travels = false; break; }
      }
      // a note with neither its contact nor its deal would hang nowhere
      if (travels && t === 'activities' && !kept.contacts.has(row.contact_id) && !kept.deals.has(row.deal_id)) travels = false;
      if (!travels) { out.left_out++; continue; }
      out.adds++; kept[t].add(row.id);
      if (person) unassigned++;
      const step = { t, row };
      if (t === 'pipelines') { step.as = pipelineName(row.name, taken); taken.add(nameKey(step.as)); pipelines.push({ name: String(row.name || ''), as: step.as }); }
      steps.push(step);
    }
  }

  const of = name => tables.find(t => t.name === name);
  for (const p of pipelines.filter(x => x.name !== x.as)) warnings.push(`A pipeline called "${p.name}" is here already. The file's pipeline would arrive beside it as "${p.as}"; the one that is here is not touched.`);
  if (of('contacts').here) warnings.push(`${of('contacts').here} contact${of('contacts').here === 1 ? '' : 's'} of the file ${of('contacts').here === 1 ? 'has' : 'have'} an email address that is in this workspace already. ${of('contacts').here === 1 ? 'That contact' : 'Those contacts'} here stay${of('contacts').here === 1 ? 's' : ''} as ${of('contacts').here === 1 ? 'it is' : 'they are'}; the file's deals and notes are attached to ${of('contacts').here === 1 ? 'it' : 'them'}.`);
  if (unassigned) warnings.push(`${unassigned} row${unassigned === 1 ? ' names' : 's name'} a person (who a contact or deal is assigned to, who wrote a note). People do not come along: ${unassigned === 1 ? 'it arrives' : 'they arrive'} without one.`);
  for (const t of tables) if (t.left_out) warnings.push(`${t.name.replace(/_/g, ' ')}: ${t.left_out} of ${t.rows} would be left out, because what ${t.left_out === 1 ? 'it belongs' : 'they belong'} to does not arrive.`);
  const carried = Object.entries(NOT_CARRIED).filter(([t, cols]) => rowsOf(t).some(r => cols.some(c => c !== 'stage_id' && r[c] !== null && r[c] !== undefined && r[c] !== 0 && r[c] !== 'kein_onboarding')));
  if (carried.some(([t]) => t === 'contacts')) warnings.push('The Engine\'s state of a contact (its folder, its onboarding) belongs to the install the file came from and is not carried over.');
  if (carried.some(([t]) => t === 'activities')) warnings.push('Meetings booked through Cal.com or Calendly arrive as plain appointments: their booking belongs to the other install\'s account.');
  const not_included = Object.keys(bundle.tables).filter(t => !DATA.includes(t) && t !== 'workspaces' && rowsOf(t).length).map(t => ({ name: t, rows: rowsOf(t).length }));
  return { tables, unassigned, pipelines, not_included, warnings: [...new Set(warnings)], blockers: [...new Set(blockers)], steps };
}
// The check's answer: decide() without the rows themselves.
function plan(bundle, schema, target) {
  const { steps, ...said } = decide(bundle, schema, target);
  return said;
}

// ── the import (Part 2) ─────────────────────────────────────────────────────
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;   // a column's name as this database gives it; anything else is not written
// A comment after the comment it answers: the rows of one table, those that point into it behind what they point to.
function parentsFirst(steps) {
  const out = [], seen = new Set(), left = [...steps], all = new Set(steps.map(s => s.row.id));
  for (let moved = true; left.length && moved;) {
    moved = false;
    for (const s of [...left]) {
      const parent = s.row.parent_id;
      if (parent === null || parent === undefined || !all.has(parent) || seen.has(parent)) { out.push(s); seen.add(s.row.id); left.splice(left.indexOf(s), 1); moved = true; }
    }
  }
  return [...out, ...left];   // what is left answers each other in a circle: written as they come
}

// The file's data is added to the workspace. Everything inside ONE transaction, with the workspace's row held so
// that two imports into one workspace come one after the other; decided there once more by decide(), written by
// INSERT only, every id given by the database. file: { name } for the record.
//   → { ok: true, id (of the record), ...what plan() says } | { ok: false, code: 'workspace' } |
//     { ok: false, code: 'blocked', blockers }
async function run(pool, workspaceId, bundle, { file = {} } = {}) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [held] } = await db.query('SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE', [workspaceId]);
    const target = held ? await targetOf(db, workspaceId, bundle) : null;
    if (!target) { await db.query('ROLLBACK'); return { ok: false, code: 'workspace' }; }
    const schema = await schemaOf(db);
    const { steps, ...said } = decide(bundle, schema, target);
    if (said.blockers.length) { await db.query('ROLLBACK'); return { ok: false, code: 'blocked', blockers: said.blockers }; }
    const became = Object.fromEntries(DATA.map(t => [t, new Map()]));   // per table: the file's id → the id here
    for (const t of DATA) {
      const mine = steps.filter(s => s.t === t), s = schema[t], skip = NOT_CARRIED[t] || [];
      for (const step of t === 'activity_comments' ? parentsFirst(mine) : mine) {
        const row = step.row;
        if (step.here) { if (Number.isInteger(step.here)) became[t].set(row.id, step.here); continue; }   // here already: used, not written
        const cols = [], marks = [], values = [];
        for (const [col, c] of Object.entries(s.columns)) {
          if (col === 'id' || !(col in row) || skip.includes(col) || !IDENT.test(col)) continue;   // the id is the database's to give
          const ref = s.refs[col];
          let v = row[col];
          if (col === 'workspace_id') v = workspaceId;
          else if (ref === PEOPLE) v = null;
          else if (ref && v !== null && v !== undefined) v = became[ref] && became[ref].has(v) ? became[ref].get(v) : null;
          if (t === 'pipelines' && col === 'name') v = step.as;
          if (t === 'activities' && col === 'source' && (v === 'calcom' || v === 'calendly')) v = 'user';   // its booking stayed where it was made
          if (v === undefined) continue;
          cols.push(`"${col}"`); values.push(c.json && v !== null ? JSON.stringify(v) : v); marks.push(`$${values.length}${c.json ? '::jsonb' : ''}`);
        }
        const { rows: [made] } = await db.query(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${marks.join(', ')}) RETURNING id`, values);
        became[t].set(row.id, made.id);
      }
    }
    const counts = Object.fromEntries(said.tables.map(x => [x.name, { adds: x.adds, here: x.here, left_out: x.left_out }]));
    const { rows: [record] } = await db.query(
      'INSERT INTO workspace_imports (workspace_id, workspace_name, file_name, source_name, exported_at, counts) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id',
      [workspaceId, target.workspace.name, String(file.name || '').slice(0, 200), String(bundle.workspace_name || '').slice(0, 200), typeof bundle.exported_at === 'string' ? bundle.exported_at.slice(0, 40) : null, JSON.stringify(counts)]
    );
    await db.query('COMMIT');
    return { ok: true, id: record.id, into: target.workspace, ...said };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { db.release(); }
}

module.exports = { MAX_BYTES, DATA, NOT_CARRIED, ImportError, readBundle, schemaOf, targetOf, pipelineName, decide, plan, parentsFirst, run };
