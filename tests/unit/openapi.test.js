// UNIT tests pinning docs/openapi.json to the code it describes (briefing §8):
// every route the two Engine routers declare is documented with its method and
// nothing undocumented is declared; every `fehler` code the code can emit is in
// the Fehler enum; the enums match the code's constants; the five webhook events
// are described with the raw-body HMAC header; the document is valid JSON that
// the two serving routes can hand out.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { inject, ROOT } = require('../helpers/load-route');

const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'openapi.json'), 'utf8'));
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const engineApiSrc = src('routes/engine-api.js');
const dokumenteSrc = src('routes/engine-dokumente.js');

// Express route declarations → OpenAPI (path, method)
function declared(source, prefix, idName) {
  const out = [];
  for (const m of source.matchAll(/router\.(get|post|patch|put|delete)\('(\/[^']*)'/g)) {
    const p = m[2].replace(/:id\b/, `{${idName}}`);
    out.push([prefix + p, m[1]]);
  }
  return out;
}

describe('the document', () => {
  test('is OpenAPI 3.1 with the security schemes, servers and the five tags', () => {
    assert.match(doc.openapi, /^3\.1\./);
    assert.equal(doc.info.title, 'Upgrads CRM – Engine API');
    assert.equal(doc.components.securitySchemes.bearerKey.scheme, 'bearer');
    assert.equal(doc.components.securitySchemes.headerKey.name, 'X-API-Key');
    assert.deepEqual(doc.security, [{ bearerKey: [] }, { headerKey: [] }]);
    assert.equal(doc.servers[0].variables.host.default, 'crm.upgrads.de');
    assert.deepEqual(doc.tags.map(t => t.name), ['Kunde', 'Dokumente', 'Notizen', 'Kommunikation', 'Meta']);
    for (const s of ['Idempotency-Key', '300 requests per minute', 'HMAC-SHA256', 'akte_version', 'ISO 8601']) assert.ok(doc.info.description.includes(s), s);
  });
  test('every route the Engine routers declare is documented with its method — and nothing more', () => {
    const inCode = [...declared(engineApiSrc, '/api/kunden', 'kunde_id'), ...declared(dokumenteSrc, '/api/dokumente', 'dokument_id')];
    assert.ok(inCode.length >= 9, `found ${inCode.length} routes in code`);
    for (const [p, m] of inCode) assert.ok(doc.paths[p] && doc.paths[p][m], `undocumented: ${m.toUpperCase()} ${p}`);
    const inDoc = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).filter(k => k !== 'parameters').map(m => [p, m]));
    for (const [p, m] of inDoc) assert.ok(inCode.some(([cp, cm]) => cp === p && cm === m), `documented but not declared: ${m.toUpperCase()} ${p}`);
  });
  test('every write operation requires the Idempotency-Key header; every operation has 401 (except the webhooks)', () => {
    for (const [p, ops] of Object.entries(doc.paths)) {
      for (const [m, op] of Object.entries(ops)) {
        if (m === 'parameters') continue;
        assert.ok(op.responses['401'], `${m} ${p} documents 401`);
        const idem = (op.parameters || []).some(x => x.$ref === '#/components/parameters/IdempotencyKey');
        assert.equal(idem, m === 'post' || m === 'patch', `${m} ${p}: Idempotency-Key ${idem ? 'present' : 'absent'}`);
        if (m === 'post' || m === 'patch') assert.ok(op.requestBody?.required, `${m} ${p} has a required body`);
      }
    }
    assert.equal(doc.components.parameters.IdempotencyKey.required, true);
    assert.equal(doc.components.parameters.IdempotencyKey.schema.maxLength, 255);
  });
  test('every fehler code the code can emit is in the Fehler enum, and the enum has nothing the code never emits', () => {
    const codes = new Set();
    for (const rel of ['routes/engine-api.js', 'routes/engine-dokumente.js', 'middleware/engine-auth.js', 'utils/idempotency.js', 'server.js']) {
      const s = src(rel);
      for (const m of s.matchAll(/fehler\(res, \d+, '([a-z_]+)'/g)) codes.add(m[1]);
      for (const m of s.matchAll(/err\('([a-z_]+)'/g)) codes.add(m[1]);
      for (const m of s.matchAll(/code: '([a-z_]+)'/g)) codes.add(m[1]);
      for (const m of s.matchAll(/return \{ error: \{ code: '([a-z_]+)'/g)) codes.add(m[1]);
    }
    for (const m of engineApiSrc.matchAll(/code: '([a-z_]+)', nachricht/g)) codes.add(m[1]);
    const documented = doc.components.schemas.Fehler.properties.fehler.properties.code.enum;
    for (const c of codes) assert.ok(documented.includes(c), `code ${c} emitted but not documented`);
    for (const c of documented) assert.ok(codes.has(c), `code ${c} documented but never emitted`);
  });
  test('enums match the code: onboarding statuses, document kinds, note kinds, communication kinds, webhook events', () => {
    const engineApi = (() => { inject('db.js', { pool: { query: async () => ({ rows: [] }) } }); delete require.cache[path.join(ROOT, 'routes', 'engine-api.js')]; return require(path.join(ROOT, 'routes', 'engine-api.js')); })();
    const kunde  = require(path.join(ROOT, 'utils', 'kunde.js'));
    const engine = require(path.join(ROOT, 'utils', 'engine.js'));
    assert.deepEqual(doc.components.schemas.OnboardingStatus.enum, engineApi.ONBOARDING_STATUSES);
    assert.deepEqual(doc.components.schemas.Dokument.properties.typ.enum, kunde.DOCUMENT_TYPES);
    assert.deepEqual(doc.components.schemas.Notiz.properties.typ.enum, Object.values(kunde.NOTE_TYPES));
    assert.deepEqual(doc.components.schemas.Kommunikation.properties.typ.enum, kunde.COMMUNICATION_TYPES);
    const events = [engine.EVENT_CONTRACT_SIGNED, engine.EVENT_CONTACT_CREATED, engine.EVENT_CONTACT_UPDATED, engine.EVENT_DOCUMENT_ADDED, engine.EVENT_TEST];
    assert.deepEqual(Object.keys(doc.webhooks), events);
    assert.deepEqual(doc.components.parameters.XUpgradsEvent.schema.enum, events);
    // same set of field names (an enum's order carries no meaning)
    assert.deepEqual([...doc.components.schemas.EventKundeAktualisiert.allOf[1].properties.daten.allOf[1].properties.geaendert.items.enum].sort(), [...new Set(Object.values(kunde.MASTER_FIELDS))].sort());
  });
  test('the webhooks describe the envelope and the raw-body signature; the Kunde schema carries the §4.3 keys', () => {
    for (const [name, hook] of Object.entries(doc.webhooks)) {
      const refs = hook.post.parameters.map(p => p.$ref);
      assert.ok(refs.includes('#/components/parameters/XUpgradsSignature') && refs.includes('#/components/parameters/XUpgradsEvent'), name);
      assert.ok(hook.post.requestBody.content['application/json'].schema.$ref.startsWith('#/components/schemas/Event'), name);
    }
    assert.equal(doc.components.parameters.XUpgradsSignature.schema.pattern, '^[0-9a-f]{64}$');
    assert.match(doc.components.parameters.XUpgradsSignature.description, /raw request body/);
    assert.doesNotMatch(doc.components.parameters.XUpgradsSignature.description, /timestamp header|sha256=/);
    assert.deepEqual(doc.components.schemas.Envelope.required, ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    const kundeKeys = [...Object.keys(doc.components.schemas.Kunde.allOf[0].properties), ...Object.keys(doc.components.schemas.Stammdaten.properties), ...Object.keys(doc.components.schemas.Kunde.allOf[2].properties)];
    assert.deepEqual(kundeKeys, ['kunde_id', 'firma', 'ansprechpartner', 'email', 'telefon', 'kontakt_typ', 'adresse', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'onboarding_status', 'drive_ordner_id', 'akte_version', 'erstellt_am', 'aktualisiert_am']);
    assert.deepEqual(doc.components.schemas.Dokument.required, ['id', 'typ', 'dateiname', 'mimetype', 'groesse', 'erstellt_am', 'download_url']);
  });
  test('every $ref resolves', () => {
    const refs = [];
    (function walk(o) { if (o && typeof o === 'object') { if (typeof o.$ref === 'string') refs.push(o.$ref); for (const v of Object.values(o)) walk(v); } })(doc);
    for (const r of refs) {
      assert.ok(r.startsWith('#/'), r);
      const target = r.slice(2).split('/').reduce((o, k) => (o == null ? undefined : o[k]), doc);
      assert.ok(target, `unresolved ${r}`);
    }
    assert.ok(refs.length > 40);
  });
  test('the two serving routes point at docs/openapi.json; the API keys card links the download', () => {
    assert.match(engineApiSrc, /path\.join\(__dirname, '\.\.', 'docs', 'openapi\.json'\)/);
    assert.match(engineApiSrc, /router\.get\('\/openapi\.json'/);
    assert.ok(engineApiSrc.indexOf("router.get('/openapi.json'") < engineApiSrc.indexOf("router.get('/:id'"), 'declared before /:id');
    const engineRoutes = src('routes/engine.js');
    assert.match(engineRoutes, /router\.get\('\/openapi\.json'/);
    assert.match(engineRoutes, /Content-Disposition', 'attachment; filename="upgrads-crm-engine-api\.openapi\.json"'/);
    const html = src('public/index.html');
    assert.match(html, /<a class="link" href="\/api\/engine\/openapi\.json" download="upgrads-crm-engine-api\.openapi\.json" data-i18n="engine_keys_openapi">/);
    const core = src('public/js/core.js');
    assert.equal((core.match(/engine_keys_openapi:/g) || []).length, 2, 'en and de');
  });
});
