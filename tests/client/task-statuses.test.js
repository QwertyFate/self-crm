// CLIENT test — getActiveTaskStatuses() in public/js/tasks.js: project
// statuses win, then the workspace's own list from Settings, then the
// built-in four. Skips itself if jsdom is not installed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { JSDOM, skipOpts } = require('../helpers/dom');
const { ROOT } = require('../helpers/load-route');

function browser() {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  w.api = { get: async () => ({}) }; w.esc = s => String(s ?? '');
  const source = fs.readFileSync(path.join(ROOT, 'public', 'js', 'tasks.js'), 'utf8');
  // core.js declares currentWorkspace; tasks.js's top-level `let`s share one script scope with the probes.
  w.eval(`let currentWorkspace = null;\n${source}\n;window.__set = (p, ws) => { currentProject = p; currentWorkspace = ws; };\nwindow.__keys = () => getActiveTaskStatuses().map(s => s.key).join(',');`);
  return w;
}
const WS   = { task_statuses: [{ key: 'backlog', label: 'Backlog', color: '#000' }, { key: 'shipped', label: 'Shipped', color: '#0f0' }] };
const PROJ = { statuses: [{ key: 'qa', label: 'QA', color: '#00f' }] };

describe('getActiveTaskStatuses precedence', skipOpts, () => {
  test('no project -> the workspace list from Settings', () => {
    const w = browser(); w.__set(null, WS);
    assert.equal(w.__keys(), 'backlog,shipped');
  });
  test("a project with its own statuses wins", () => {
    const w = browser(); w.__set(PROJ, WS);
    assert.equal(w.__keys(), 'qa');
  });
  test('a project with an empty list falls back to the workspace list', () => {
    const w = browser(); w.__set({ statuses: [] }, WS);
    assert.equal(w.__keys(), 'backlog,shipped');
  });
  test('nothing configured -> the built-in four, without throwing', () => {
    const w = browser(); w.__set(null, null);
    assert.equal(w.__keys(), 'todo,in_progress,in_review,done');
  });
});
