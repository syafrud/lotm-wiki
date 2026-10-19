// Vanilla front-end for the wiki, as ES modules without a build step. Talks only to /api/*.
//
// Routes (hash):  #/                     chapter overview
//                 #/s/<section>          entity list for a section (grouped)
//                 #/e/<section>/<id>     one entity
//                 #/search?q=...         search
//                 #/questions            open questions so far
//                 #/since?from=A         what changed since chapter A
//                 #/volume/<i>           a volume, one line per chapter
//                 #/about | #/report | #/reports   about, report form, reports list
import { $, storage, isTyping } from './util.js';
import { api } from './api.js';
import { store, noteMove } from './store.js';
import { initPicker, loadChapters, syncPickers, stepChapter, sheetOpen, closeSheet } from './components/picker.js';
import { initDrawer, drawerOpen, closeDrawer } from './components/sidebar.js';
import { initModal, modalOpen, closeDisclaimer } from './components/modal.js';
import { render, route } from './router.js';
import { initUpdates } from './components/updates.js';
import { initPalette, openPalette, closePalette, paletteOpen } from './components/palette.js';

const content = $('#content');

function effectiveTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
  const dark = effectiveTheme() === 'dark';
  const button = $('#theme-toggle');
  button.textContent = dark ? '☀' : '☾';
  button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

// The sticky offsets follow the real top bar height (it wraps on narrow screens).
function trackTopbar() {
  const bar = $('.topbar');
  const set = () => document.documentElement.style.setProperty('--topbar-h', `${bar.offsetHeight}px`);
  set();
  if ('ResizeObserver' in window) new ResizeObserver(set).observe(bar);
}

function initKeyboard() {
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (modalOpen()) return closeDisclaimer();
      if (paletteOpen()) return closePalette();
      if (sheetOpen()) return closeSheet();
      if (drawerOpen()) return closeDrawer();
      return;
    }
    if (modalOpen() || paletteOpen() || isTyping() || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepChapter(-1); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); stepChapter(1); }
    else if (ev.key === '/') { ev.preventDefault(); openPalette(); }
  });
}

async function boot() {
  applyTheme(storage.get('wiki.theme') || '');
  $('#theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storage.set('wiki.theme', next);
  });
  trackTopbar();

  const saved = Number(storage.get('wiki.ch'));
  const fromUrl = Number(route().params.get('ch'));
  const guess = [fromUrl, saved].find(n => Number.isInteger(n) && n > 0) ?? 1;
  const [schema, chapters] = await Promise.all([api('/api/schema'), api(`/api/chapters?ch=${guess}`)]);
  store.schema = schema;
  store.chapters = chapters;
  store.chaptersAt = guess;
  if (!chapters.length) {
    content.innerHTML = '<h1>No chapters yet</h1><p class="muted">Extract a chapter, then run <code>node cli.js db</code>.</p>';
    return;
  }
  // new readers start at the first chapter, never the last (that would show the whole story)
  store.ch = [fromUrl, saved].find(n => chapters.some(c => c.n === n)) ?? chapters[0].n;
  // a new session opened further on than where the last one ended
  if (saved && chapters.some(c => c.n === saved)) noteMove(saved, store.ch);
  await loadChapters(store.ch);
  syncPickers();

  initPicker();
  initDrawer();
  initKeyboard();
  initPalette();
  initModal();
  initUpdates().catch(() => {}); // the notes are a nicety: never hold the page up
  $('#skip-link').addEventListener('click', () => ($('h1', content) ?? content).focus());

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', render);
  render();
}

boot().catch(err => { content.textContent = `Error: ${err.message}`; });
