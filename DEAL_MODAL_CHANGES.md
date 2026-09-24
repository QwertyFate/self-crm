# Deal modal — change log

Append-only. New work goes at the bottom as a new part. Earlier parts are never edited.

---

## Part 1 — 2026-09-24: remove the "— No stage —" option from the deal form

### What changed (behaviour)

The Stage dropdown in the create/edit deal modal no longer offers an empty "— No stage —" entry. When a pipeline is selected the dropdown lists only that pipeline's stages, and the browser selects the first stage by default for a new deal. Editing an existing deal still pre-selects its current stage.

### Files and lines touched

| File | Lines | Change |
|---|---|---|
| `public/js/modals.js` | 1318–1320 | `populateDealStages`: dropped the leading `<option value="">— No stage —</option>` so only pipeline stages are rendered |

**Before (1318–1321):**

```js
  stageSel.innerHTML = `<option value="">— No stage —</option>` +
    (pipeline?.stages || []).map(s =>
      `<option value="${s.id}" ${selectedStageId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
```

**After (1318–1320):**

```js
  stageSel.innerHTML = (pipeline?.stages || []).map(s =>
      `<option value="${s.id}" ${selectedStageId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
```

### Verification

- `node --check public/js/modals.js` passes.
- `grep -n "No stage" public/js/modals.js` returns nothing.

### Deliberately left unchanged

- `public/app.js` line 2885 has the same option, but `public/index.html` loads `js/core.js` and `js/modals.js`, not `app.js`, so that legacy file is not served.
- `public/js/integrations.js` lines 236 and 376 keep "— No stage —" because those are integration mapping selects, not the deal form.
- `public/js/contacts.js` line 217 keeps `opt_no_stage` because that is the contact stage inline editor.
- `saveDeal` still sends `stage_id: value || null`, so the server contract is unchanged. If a pipeline has zero stages the dropdown is empty and `stage_id` is sent as `null`, as before.
