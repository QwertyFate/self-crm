/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR CLOCK + the timezone preference behind it.

   A ticking clock in the sidebar, rendered in the user's own timezone
   (users.timezone, default Europe/Berlin). startClock() is called by showApp()
   and stopClock() by resetClientState(), so the interval never outlives a
   session.

   The timezone picker lives on the Settings page but is rendered here
   (renderTimezoneSetting), because this file owns COMMON_TIMEZONES and the
   formatting. Saving PATCHes /api/auth/preferences, which validates the zone
   with Intl.DateTimeFormat before storing it.

   FUNCTION MAP  currentTimezone, startClock, stopClock, updateClock,
                 renderTimezoneSetting, saveTimezoneSetting
   ═══════════════════════════════════════════════════════════════════════════ */

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

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
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
  if (msgEl) { msgEl.textContent = 'Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}
