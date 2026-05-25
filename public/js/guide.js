// ── CRM GUIDE / ONBOARDING TOUR ───────────────────────────
const GUIDE_KEY = 'crm_guide_seen_v1';

const GUIDE_STEPS = [
  {
    title: 'Welcome to your CRM!',
    body:  'This quick tour walks you through the key features. Use the arrows to move between steps, or skip anytime. You can restart it with the <strong>?</strong> button in the sidebar.',
    target: null,
    pos: 'center',
  },
  {
    title: 'Sidebar Navigation',
    body:  'The sidebar is how you move around. <strong>Workspace</strong> contains your core data — Deals, Contacts, Suppliers, and Tasks. <strong>Tools</strong> has Activities, Listings, Board, and Analytics.',
    target: '.sidebar-main',
    pos: 'right',
  },
  {
    title: 'Deals',
    body:  'This is your pipeline. Deals move through stages as they progress. You can view them as a Kanban board or a table.',
    target: '#page-deals .page-header',
    pos: 'bottom',
    action: () => switchPage('deals'),
  },
  {
    title: 'Creating a Deal',
    body:  'Click <strong>+ Add Deal</strong> to create a new deal. Give it a title, assign it to a pipeline and stage, set a value, and assign it to a team member.',
    target: '#page-deals .page-header .btn-primary',
    pos: 'bottom',
    action: () => switchPage('deals'),
  },
  {
    title: 'Contacts',
    body:  'Contacts are the people and companies you work with. Each contact can be linked to deals and have activities logged against them.',
    target: '#page-contacts .page-header',
    pos: 'bottom',
    action: () => { currentContactType = 'contact'; switchPage('contacts'); },
  },
  {
    title: 'Creating a Contact',
    body:  'Click <strong>+ Add Contact</strong> to add a person or company. You can add custom fields like industry, notes, or any data that matters to your workflow.',
    target: '#page-contacts .page-header .btn-primary',
    pos: 'bottom',
    action: () => { currentContactType = 'contact'; switchPage('contacts'); },
  },
  {
    title: 'Linking a Contact to a Deal',
    body:  'When creating or editing a deal, use the <strong>Contact</strong> field to link a contact to it. Open any deal, click the contact search box, and pick from your contact list.',
    target: null,
    pos: 'center',
  },
  {
    title: 'Listings',
    body:  'Listings (also called Objects) are extra entities — properties, products, projects, or anything you want to track alongside deals and contacts.',
    target: '#page-objects .page-header',
    pos: 'bottom',
    action: () => switchPage('objects'),
  },
  {
    title: 'Connecting a Listing to a Deal',
    body:  'Inside any deal, scroll to the <strong>Linked Listings</strong> section at the bottom of the deal panel. Search and attach any listing directly from there.',
    target: null,
    pos: 'center',
  },
  {
    title: 'Settings',
    body:  'Settings is where you customise the workspace — pipelines, custom fields, team members, and more. Open it from the gear icon at the bottom of the sidebar.',
    target: '#page-settings .settings-page-header',
    pos: 'bottom',
    action: () => switchPage('settings'),
  },
  {
    title: 'Adding Contact Fields',
    body:  'Go to the <strong>Contacts</strong> tab in Settings. Under <em>Custom Fields</em>, click <strong>+ Add</strong> to create a new field — text, number, date, dropdown, and more.',
    target: '.settings-tab[data-tab="contacts"]',
    pos: 'bottom',
    action: () => { switchPage('settings'); setTimeout(() => switchSettingsTab('contacts'), 300); },
  },
  {
    title: 'Adding Deal Fields',
    body:  'Go to the <strong>Deals</strong> tab in Settings. Under <em>Deal Fields</em>, click <strong>+ Add</strong> to attach extra properties to every deal — like deal type, priority, or close probability.',
    target: '.settings-tab[data-tab="deals"]',
    pos: 'bottom',
    action: () => { switchPage('settings'); setTimeout(() => switchSettingsTab('deals'), 300); },
  },
  {
    title: "You're all set!",
    body:  "That covers the essentials. Explore at your own pace — and remember, you can reopen this guide any time by clicking the <strong>?</strong> button in the sidebar. Good luck!",
    target: null,
    pos: 'center',
  },
];

let guideStep    = 0;
let guideActive  = false;
let guideResizeObs = null;

// ── Public API ─────────────────────────────────────────────
function startGuide() {
  guideStep   = 0;
  guideActive = true;
  document.getElementById('guide-overlay').classList.remove('hidden');
  showGuideStep(0);
}

function endGuide() {
  guideActive = false;
  document.getElementById('guide-overlay').classList.add('hidden');
  document.getElementById('guide-spotlight').style.cssText = 'display:none';
  // Save to both localStorage (fast) and DB (cross-device)
  localStorage.setItem(GUIDE_KEY, '1');
  api.patch('/api/analytics/layout', { guide_seen: true }).then(() => {
    if (currentUser) currentUser.analytics_layout = { ...(currentUser.analytics_layout || {}), guide_seen: true };
  });
  if (guideResizeObs) { guideResizeObs.disconnect(); guideResizeObs = null; }
}

function guideNext() {
  if (guideStep < GUIDE_STEPS.length - 1) { guideStep++; showGuideStep(guideStep); }
  else endGuide();
}

function guidePrev() {
  if (guideStep > 0) { guideStep--; showGuideStep(guideStep); }
}

function maybeStartGuide() {
  // Check DB first (source of truth), fall back to localStorage
  const seenInDb    = currentUser?.analytics_layout?.guide_seen === true;
  const seenLocally = !!localStorage.getItem(GUIDE_KEY);
  if (seenInDb) {
    // Sync localStorage so future checks are instant
    localStorage.setItem(GUIDE_KEY, '1');
    return;
  }
  if (!seenLocally) startGuide();
}

// ── Step rendering ─────────────────────────────────────────
async function showGuideStep(idx) {
  const step = GUIDE_STEPS[idx];
  if (!step) { endGuide(); return; }

  if (step.action) {
    step.action();
    await new Promise(r => setTimeout(r, 380));
  }

  // Update text
  document.getElementById('guide-title').innerHTML = step.title;
  document.getElementById('guide-body').innerHTML  = step.body;
  document.getElementById('guide-step-counter').textContent = `${idx + 1} of ${GUIDE_STEPS.length}`;

  // Prev / Next buttons
  document.getElementById('guide-prev-btn').style.visibility = idx === 0 ? 'hidden' : '';
  document.getElementById('guide-next-btn').textContent = idx === GUIDE_STEPS.length - 1 ? 'Finish' : 'Next →';

  // Progress dots
  document.getElementById('guide-dots').innerHTML = GUIDE_STEPS.map((_, i) =>
    `<span class="guide-dot${i === idx ? ' active' : ''}"></span>`
  ).join('');

  positionGuideStep(step);
}

function positionGuideStep(step) {
  const spotlight = document.getElementById('guide-spotlight');
  const tooltip   = document.getElementById('guide-tooltip');

  if (!step.target) {
    // Centered card — no spotlight
    spotlight.style.cssText = 'display:none';
    tooltip.style.cssText   = '';
    tooltip.className       = 'guide-tooltip guide-tooltip-center';
    return;
  }

  const target = document.querySelector(step.target);
  if (!target) {
    spotlight.style.cssText = 'display:none';
    tooltip.className       = 'guide-tooltip guide-tooltip-center';
    return;
  }

  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  setTimeout(() => placeSpotlight(step, target), 120);
}

function placeSpotlight(step, target) {
  const spotlight = document.getElementById('guide-spotlight');
  const tooltip   = document.getElementById('guide-tooltip');
  const pad = 8;
  const r   = target.getBoundingClientRect();

  spotlight.style.cssText = `
    display: block;
    left:   ${r.left   - pad}px;
    top:    ${r.top    - pad}px;
    width:  ${r.width  + pad * 2}px;
    height: ${r.height + pad * 2}px;
  `;

  // Tooltip positioning
  tooltip.className = 'guide-tooltip';
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = 320, th = 200; // approx tooltip size

  if (step.pos === 'right') {
    tooltip.style.cssText = `left:${Math.min(r.right + pad + 12, vw - tw - 12)}px; top:${Math.max(r.top, 12)}px;`;
  } else if (step.pos === 'bottom') {
    const left = Math.min(Math.max(r.left, 12), vw - tw - 12);
    const top  = r.bottom + pad + 12 + th > vh
      ? r.top - th - pad - 12
      : r.bottom + pad + 12;
    tooltip.style.cssText = `left:${left}px; top:${top}px;`;
  } else {
    tooltip.style.cssText = '';
    tooltip.className     = 'guide-tooltip guide-tooltip-center';
  }
}

// Reposition on scroll/resize
window.addEventListener('resize', () => {
  if (!guideActive) return;
  const step = GUIDE_STEPS[guideStep];
  if (step?.target) {
    const target = document.querySelector(step.target);
    if (target) placeSpotlight(step, target);
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && guideActive) endGuide();
});
