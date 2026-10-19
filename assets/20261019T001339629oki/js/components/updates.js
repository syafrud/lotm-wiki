// Update notes (PLAN D1.8). data/updates.json lists every deploy's note, newest first (the static
// site ships the file, the server builds it from rancangan/UPDATES.md). A returning reader sees the
// notes they have not seen yet once, in a banner they can dismiss; a first visit announces nothing.
// An open page checks again every 10 minutes and when it comes back to the front, and offers a
// reload when a newer deploy is out (nothing is downloaded again until the reader reloads).
import { $, esc, storage } from '../util.js';

const KEY = 'wiki.seenUpdate';
const POLL_MS = 10 * 60 * 1000;
const SHOW_MAX = 3;
let loadedId = null;

export async function fetchUpdates() {
  try {
    const r = await fetch('data/updates.json', { cache: 'no-cache' });
    const list = r.ok ? await r.json() : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export const noteHtml = (note) => String(note).split('\n').filter(l => l.trim()).map(l => `<span class="update-line">${esc(l)}</span>`).join(' ');

function show(html) {
  const bar = $('#update-banner');
  bar.innerHTML = html;
  bar.hidden = false;
}

function dismiss() {
  if (loadedId) storage.set(KEY, loadedId);
  $('#update-banner').hidden = true;
}

async function check() {
  const list = await fetchUpdates();
  if (!loadedId || !list[0]?.id || list[0].id === loadedId) return;
  show(`<span class="update-text"><strong>A new version of the wiki is available.</strong></span>
    <button type="button" class="btn" id="update-reload">Reload</button>`);
}

export async function initUpdates() {
  const bar = $('#update-banner');
  bar.addEventListener('click', (ev) => {
    if (ev.target.closest('#update-dismiss, .update-more')) dismiss();
    else if (ev.target.closest('#update-reload')) location.reload();
  });
  const list = await fetchUpdates();
  loadedId = list[0]?.id ?? null;
  const seen = storage.get(KEY);
  if (loadedId && !seen) storage.set(KEY, loadedId); // first visit: everything is new, nothing to announce
  else if (loadedId && seen !== loadedId) {
    const upTo = list.findIndex(u => u.id <= seen);
    const fresh = list.slice(0, Math.min(SHOW_MAX, upTo < 0 ? list.length : Math.max(1, upTo)));
    show(`<span class="update-text"><strong>Updated ${esc(fresh[0].date)}:</strong> ${fresh.map(u => noteHtml(u.note)).join(' ')}</span>
      <a href="#/about" class="update-more">All updates</a>
      <button type="button" class="btn btn-quiet" id="update-dismiss">Dismiss</button>`);
  }
  setInterval(check, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
