/* ═══════════════════════════════════════════════════════════════════════════
   PRODUCT TOUR — the step-by-step overlay for first-time users.

   OFF BY DEFAULT, PLATFORM-WIDE. loadTourFlag() reads GET /api/platform/features
   and the tour only exists when a platform admin has turned tourEnabled on in
   the admin console. core.js's help menu shows "Start the product tour" only
   while that flag is true.

   GUIDE_STEPS is the content: an array of { title, body, target, pos }. target
   is a CSS selector for the element to spotlight (null = a centred card), and
   some steps call switchPage() first so the element they point at exists.
   To add a step, add an entry — no other change needed.

   HOW IT PAINTS: a full-screen overlay plus a "spotlight" div positioned over
   the target (placeGuideSpotlight), and a tooltip card beside it
   (positionGuideStep). A ResizeObserver keeps both aligned while the page
   reflows.

   "ALREADY SEEN" is remembered in localStorage under crm_guide_seen_v1.
   ⚠ endGuide() also tries to persist it server-side with
     PATCH /api/analytics/layout { guide_seen: true }, but that route only
     accepts stat_card_order / hidden_stat_cards / section_order / trend_config
     and silently drops anything else — so the flag never reaches the database
     and the tour reappears in a new browser profile.

   FUNCTION MAP  loadTourFlag, maybeStartGuide, startGuide, endGuide,
                 guideNext, guidePrev, showGuideStep, positionGuideStep,
                 placeSpotlight
   ═══════════════════════════════════════════════════════════════════════════ */

const GUIDE_KEY = 'crm_guide_seen_v1';

// title / body are dictionary keys (gd_*), resolved with t() in showGuideStep so a
// language switch takes effect on the next step; the bodies carry <strong>/<em> markup.
const GUIDE_STEPS = [
  {
    title: 'gd_welcome_title',
    body:  'gd_welcome_body',
    target: null,
    pos: 'center',
  },
  {
    title: 'gd_sidebar_title',
    body:  'gd_sidebar_body',
    target: '.sidebar-main',
    pos: 'right',
  },
  {
    title: 'gd_deals_title',
    body:  'gd_deals_body',
    target: '#page-deals .page-header',
    pos: 'bottom',
    action: () => switchPage('deals'),
  },
  {
    title: 'gd_add_deal_title',
    body:  'gd_add_deal_body',
    target: '#page-deals .page-header .btn-primary',
    pos: 'bottom',
    action: () => switchPage('deals'),
  },
  {
    title: 'gd_contacts_title',
    body:  'gd_contacts_body',
    target: '#page-contacts .page-header',
    pos: 'bottom',
    action: () => { currentContactType = 'contact'; switchPage('contacts'); },
  },
  {
    title: 'gd_add_contact_title',
    body:  'gd_add_contact_body',
    target: '#page-contacts .page-header .btn-primary',
    pos: 'bottom',
    action: () => { currentContactType = 'contact'; switchPage('contacts'); },
  },
  {
    title: 'gd_link_contact_title',
    body:  'gd_link_contact_body',
    target: null,
    pos: 'center',
  },
  {
    title: 'gd_listings_title',
    body:  'gd_listings_body',
    target: '#page-objects .page-header',
    pos: 'bottom',
    action: () => switchPage('objects'),
  },
  {
    title: 'gd_link_listing_title',
    body:  'gd_link_listing_body',
    target: null,
    pos: 'center',
  },
  {
    title: 'gd_settings_title',
    body:  'gd_settings_body',
    target: '#page-settings .settings-page-header',
    pos: 'bottom',
    action: () => switchPage('settings'),
  },
  {
    title: 'gd_contact_fields_title',
    body:  'gd_contact_fields_body',
    target: '.settings-tab[data-tab="contacts"]',
    pos: 'bottom',
    action: () => { switchPage('settings'); setTimeout(() => switchSettingsTab('contacts'), 300); },
  },
  {
    title: 'gd_deal_fields_title',
    body:  'gd_deal_fields_body',
    target: '.settings-tab[data-tab="deals"]',
    pos: 'bottom',
    action: () => { switchPage('settings'); setTimeout(() => switchSettingsTab('deals'), 300); },
  },
  {
    title: 'gd_done_title',
    body:  'gd_done_body',
    target: null,
    pos: 'center',
  },
];

let guideStep    = 0;
let guideActive  = false;
let guideResizeObs = null;
// Platform-wide switch, owned by the admin console. Default OFF: the tour does
// not exist for users until an admin enables it.
let tourEnabled  = false;

async function loadTourFlag() {
  try {
    const features = await api.get('/api/platform/features');
    tourEnabled = features?.tourEnabled === true;
  } catch {
    tourEnabled = false;
  }
  // The "Start the product tour" entry of the top-bar help menu reads this flag (openHelpMenu in core.js).
  return tourEnabled;
}

function startGuide() {
  if (!tourEnabled) return;
  guideStep   = 0;
  guideActive = true;
  document.getElementById('guide-overlay').classList.remove('hidden');
  showGuideStep(0);
}

function endGuide() {
  guideActive = false;
  document.getElementById('guide-overlay').classList.add('hidden');
  document.getElementById('guide-spotlight').style.cssText = 'display:none';
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

async function maybeStartGuide() {
  if (!(await loadTourFlag())) return; // tour disabled platform-wide — nothing to show
  const seenInDb    = currentUser?.analytics_layout?.guide_seen === true;
  const seenLocally = !!localStorage.getItem(GUIDE_KEY);
  if (seenInDb) {
    localStorage.setItem(GUIDE_KEY, '1');
    return;
  }
  if (!seenLocally) startGuide();
}

async function showGuideStep(idx) {
  const step = GUIDE_STEPS[idx];
  if (!step) { endGuide(); return; }

  if (step.action) {
    step.action();
    await new Promise(r => setTimeout(r, 380));
  }

  document.getElementById('guide-title').innerHTML = t(step.title);
  document.getElementById('guide-body').innerHTML  = t(step.body);
  document.getElementById('guide-step-counter').textContent = tf('tk_n_of_total', { n: idx + 1, total: GUIDE_STEPS.length });

  document.getElementById('guide-prev-btn').style.visibility = idx === 0 ? 'hidden' : '';
  // Sets the button's own label and icon without touching its siblings — a
  // plain `.textContent =` here used to wipe out the arrow icon entirely,
  // from the very first step onward (fixed; see DESIGN_PRO_CHANGES.md Part 15).
  const isLast = idx === GUIDE_STEPS.length - 1;
  const nextBtn = document.getElementById('guide-next-btn');
  nextBtn.innerHTML = isLast
    ? `<span>${esc(t('gd_finish'))}</span>${icon('check', 'ic-sm')}`
    : `<span>${esc(t('gd_next'))}</span>${icon('chevron-right', 'ic-sm')}`;

  document.getElementById('guide-dots').innerHTML = GUIDE_STEPS.map((_, i) =>
    `<span class="guide-dot${i === idx ? ' active' : ''}"></span>`
  ).join('');

  positionGuideStep(step);
}

function positionGuideStep(step) {
  const spotlight = document.getElementById('guide-spotlight');
  const tooltip   = document.getElementById('guide-tooltip');

  if (!step.target) {
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

  tooltip.className = 'guide-tooltip';
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = 320, th = 200;

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

window.addEventListener('resize', () => {
  if (!guideActive) return;
  const step = GUIDE_STEPS[guideStep];
  if (step?.target) {
    const target = document.querySelector(step.target);
    if (target) placeSpotlight(step, target);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && guideActive) endGuide();
});
