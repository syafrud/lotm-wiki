// Section navigation with per-section counts from /api/counts, and the mobile drawer.
import { $, esc, roman } from '../util.js';
import { api } from '../api.js';
import { store, sectionTitle } from '../store.js';
import { link } from './ui.js';
import { currentVolumeIndex } from '../views/volume.js';
import { REPORTS } from '../mode.js';

const sidebar = $('#sidebar');
import { SHORT } from '../store.js';
const toggle = $('#nav-toggle');
let token = 0;

export async function renderSidebar(path) {
  const my = ++token;
  let counts = null;
  try { counts = await api(`/api/counts?ch=${store.ch}`); } catch {}
  if (my !== token) return;
  const by = Object.fromEntries((counts?.sections ?? []).map(s => [s.key, s]));
  const item = (hash, label, active, extra = '') => link(hash, `<span>${label}</span>${extra}`, active ? 'active' : '', { current: active });
  const sections = store.schema.sections.map(s => {
    const c = by[s.key];
    const count = c ? `<span class="counts">${c.new ? `<span class="count-new" title="${c.new} new in this chapter">+${c.new}</span>` : ''}<span class="count" title="${c.total} known through this chapter">${c.total}</span></span>` : '';
    return item(`#/s/${s.key}`, esc(SHORT[s.key] ?? sectionTitle(s.key)), path === `/s/${s.key}`, count);
  });
  const vi = currentVolumeIndex();
  sidebar.innerHTML = `
    <div class="group">Index</div>
    ${sections.join('')}
    <div class="group">Reading</div>
    ${item('#/', `Chapter ${store.ch} overview`, path === '/')}
    ${item(`#/volume/${vi}`, `Volume ${roman(vi)}, chapter by chapter`, path.startsWith('/volume/'))}
    ${item('#/questions', 'Open questions', path === '/questions')}
    ${item('#/since', 'Since you last read', path === '/since')}
    <div class="group">This wiki</div>
    ${item('#/about', 'About', path === '/about')}
    ${!REPORTS ? '' : item('#/report', 'Report an error', path === '/report')}
    ${!REPORTS ? '' : item('#/reports', 'Reports', path === '/reports')}`;
}

// ---- mobile drawer ----

export const drawerOpen = () => document.body.classList.contains('nav-open');

export function openDrawer() {
  document.body.classList.add('nav-open');
  toggle.setAttribute('aria-expanded', 'true');
  sidebar.querySelector('a')?.focus();
}

export function closeDrawer({ restoreFocus = true } = {}) {
  if (!drawerOpen()) return;
  document.body.classList.remove('nav-open');
  toggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) toggle.focus();
}

export function initDrawer() {
  toggle.addEventListener('click', () => (drawerOpen() ? closeDrawer() : openDrawer()));
  $('#nav-overlay').addEventListener('click', () => closeDrawer());
  sidebar.addEventListener('click', (ev) => { if (ev.target.closest('a')) closeDrawer({ restoreFocus: false }); });
}
