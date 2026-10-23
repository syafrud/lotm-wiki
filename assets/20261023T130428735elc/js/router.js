// Hash routing. The reading chapter lives in the query part of the hash (?ch=N).
// A render token drops results of a render that a newer one has overtaken; the scroll position is
// remembered per hash and restored when coming back, and kept when only the query changes.
import { $, esc } from './util.js';
import { store, rememberChapter, noteMove } from './store.js';
import { setChapter, syncPickers, loadChapters, closeSheet } from './components/picker.js';
import { renderSidebar } from './components/sidebar.js';
import { closePalette } from './components/palette.js';
import { notFoundHtml } from './components/ui.js';
import { overview } from './views/overview.js';
import { section } from './views/section.js';
import { entity } from './views/entity.js';
import { search } from './views/search.js';
import { about, report, reports } from './views/pages.js';
import { questions, since } from './views/reading.js';
import { volume } from './views/volume.js';
import { pathwaysPage } from './views/pathways.js';

const SITE = 'Mysteries Wiki';
const content = $('#content');
const scrollByHash = new Map();
let token = 0;
let lastPath = null;
let lastHash = null;

export function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, query = ''] = hash.split('?');
  return { path, params: new URLSearchParams(query) };
}

function viewFor(path, params) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return overview();
  if (parts[0] === 's' && parts[1] && parts.length === 2) return section(parts[1], params);
  if (parts[0] === 'e' && parts[1] && parts[2] && parts.length === 3) return entity(parts[1], decodeURIComponent(parts[2]), params);
  if (path === '/search') return search(params.get('q') ?? '', params);
  if (parts[0] === 'volume' && /^\d+$/.test(parts[1] ?? '') && parts.length === 2) return volume(Number(parts[1]));
  if (path === '/questions') return questions();
  if (path === '/pathways') return pathwaysPage();
  if (path === '/since') return since(params);
  if (path === '/about') return about();
  if (path === '/report') return report(params);
  if (path === '/reports') return reports(params);
  return notFoundHtml();
}

// Change query parameters of the current page (tab, open field, …) without re-rendering it or
// adding a history entry. null removes a parameter.
export function replaceQuery(changes) {
  const { path, params } = route();
  for (const [k, v] of Object.entries(changes)) {
    if (v == null || v === '') params.delete(k); else params.set(k, String(v));
  }
  const hash = `#${path}?${params}`;
  history.replaceState(history.state, '', hash);
  lastHash = hash;
}

export async function render() {
  const { path, params } = route();
  const raw = params.get('ch');
  const ch = Number(raw);
  if (!raw || !store.chapters.some(c => c.n === ch)) return setChapter(store.ch); // normalise the URL
  if (ch !== store.ch) {
    noteMove(store.ch, ch);
    store.ch = ch;
    rememberChapter(ch);
    syncPickers();
    loadChapters(ch).then(syncPickers).catch(() => {});
  }

  if (path !== lastPath) closeSheet({ restoreFocus: false }); // a new page, not just another chapter
  closePalette({ restoreFocus: false });
  const my = ++token;
  if (lastHash) scrollByHash.set(lastHash, window.scrollY);
  const samePage = path === lastPath;
  renderSidebar(path);
  content.setAttribute('aria-busy', 'true');
  if (!samePage) content.innerHTML = '<p class="muted">Loading…</p>';

  let out;
  try {
    out = await viewFor(path, params);
  } catch (err) {
    out = { title: 'Error', html: `<h1 tabindex="-1">Error</h1><p class="empty">${esc(err.message)}</p>` };
  }
  if (my !== token) return; // a newer navigation has already started

  content.innerHTML = out.html;
  content.removeAttribute('aria-busy');
  out.mount?.(content);
  document.title = `${out.title} · ${SITE}`;

  if (!samePage) {
    window.scrollTo(0, scrollByHash.get(location.hash) ?? 0);
    // move focus to the new page's heading (not on the first load)
    if (lastPath !== null) $('h1', content)?.focus({ preventScroll: true });
  }
  lastPath = path;
  lastHash = location.hash;
}
