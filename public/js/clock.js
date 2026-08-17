// ── CLOCK ─────────────────────────────────────────────────
// User-specific timezone clock displayed in the top-left sidebar.
// Defaults to Germany (Europe/Berlin) for every user, but each user
// can change their own timezone via Settings → General → Timezone.

let clockTimer = null;
const COMMON_TIMEZONES = [
  { value: 'Europe/Berlin',              label: 'Berlin (Germany)' },
  { value: 'America/New_York',           label: 'New York (USA)' },
  { value: 'America/Los_Angeles',        label: 'Los Angeles (USA)' },
  { value: 'Europe/London',              label: 'London (UK)' },
  { value: 'Europe/Paris',               label: 'Paris (France)' },
  { value: 'Europe/Madrid',              label: 'Madrid (Spain)' },
  { value: 'Europe/Rome',                label: 'Rome (Italy)' },
  { value: 'Europe/Amsterdam',           label: 'Amsterdam (Netherlands)' },
  { value: 'Europe/Vienna',              label: 'Vienna (Austria)' },
  { value: 'Europe/Zurich',              label: 'Zurich (Switzerland)' },
  { value: 'Europe/Stockholm',           label: 'Stockholm (Sweden)' },
  { value: 'Europe/Warsaw',              label: 'Warsaw (Poland)' },
  { value: 'Europe/Athens',              label: 'Athens (Greece)' },
  { value: 'Europe/Lisbon',              label: 'Lisbon (Portugal)' },
  { value: 'Asia/Manila',                label: 'Manila (Philippines)' },
  { value: 'Asia/Taipei',                label: 'Taipei (Taiwan)' },
  { value: 'Asia/Tokyo',                 label: 'Tokyo (Japan)' },
  { value: 'Asia/Shanghai',              label: 'Shanghai (China)' },
  { value: 'Asia/Singapore',             label: 'Singapore' },
  { value: 'Asia/Dubai',                 label: 'Dubai (UAE)' },
  { value: 'Australia/Sydney',           label: 'Sydney (Australia)' },
  { value: 'UTC',                        label: 'UTC' },
];

function currentTimezone() {
  return currentUser?.timezone || 'Europe/Berlin';
}

function startClock() {
  updateClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateClock, 1000);
}

function updateClock() {
  const el = document.getElementById('sidebar-clock');
  if (!el) return;
  const tz = currentTimezone();
  try {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: tz,
    });
  } catch {
    el.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
}

function renderTimezoneSetting() {
  const el = document.getElementById('timezone-select');
  if (!el) return;
  const current = currentTimezone();
  el.innerHTML = COMMON_TIMEZONES.map(tz => `
    <option value="${tz.value}" ${tz.value === current ? 'selected' : ''}>${esc(tz.label)}</option>
  `).join('');
}

async function saveTimezoneSetting() {
  const el = document.getElementById('timezone-select');
  if (!el) return;
  const timezone = el.value;
  const msgEl = document.getElementById('timezone-msg');
  const res = await api.patch('/api/auth/preferences', { timezone });
  if (res.error) {
    if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); }
    return;
  }
  if (currentUser) currentUser.timezone = timezone;
  updateClock();
  if (msgEl) { msgEl.textContent = '✓ Timezone saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}