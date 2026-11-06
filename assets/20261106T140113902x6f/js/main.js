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
import { initPicker, loadChapters, syncPickers, stepChapter, setChapter, sheetOpen, closeSheet } from './components/picker.js';
import { initDrawer, drawerOpen, closeDrawer } from './components/sidebar.js';
import { initModal, modalOpen, closeDisclaimer } from './components/modal.js';
import { initConfirm, confirmOpen, closeConfirm, confirmChapter, askBeforeJump } from './components/confirm.js';
import { ACCOUNTS, initAccount, signedIn, onAccountChange, loadSettings, saveSettings, loadProgress, saveProgress } from './components/account.js';
import { renderSidebar } from './components/sidebar.js';
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
      if (confirmOpen()) return closeConfirm(false);
      if (modalOpen()) return closeDisclaimer();
      if (paletteOpen()) return closePalette();
      if (sheetOpen()) return closeSheet();
      if (drawerOpen()) return closeDrawer();
      return;
    }
    if (confirmOpen() || modalOpen() || paletteOpen() || isTyping() || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const arrows = storage.get('wiki.arrows') !== 'off'; // About → Settings
    if (arrows && ev.key === 'ArrowLeft') { ev.preventDefault(); stepChapter(-1); }
    else if (arrows && ev.key === 'ArrowRight') { ev.preventDefault(); stepChapter(1); }
    else if (ev.key === '/') { ev.preventDefault(); openPalette(); }
  });
}

// The account's settings come to this browser (or this browser's go up, the first time); the
// account's chapter is offered when it is further on — through the same check as any jump ahead.
async function syncAccount({ live = false } = {}) {
  try {
    const s = await loadSettings();
    if (s) for (const [key, on] of [['wiki.arrows', s.arrow_keys], ['wiki.confirmJump', s.confirm_jump]]) { if (on) storage.remove(key); else storage.set(key, 'off'); }
    else await saveSettings({ arrow_keys: storage.get('wiki.arrows') !== 'off', confirm_jump: storage.get('wiki.confirmJump') !== 'off' });
    const remote = await loadProgress();
    if (remote > store.ch && store.chapters.some(c => c.n === remote) && (!askBeforeJump() || await confirmChapter(remote, { from: store.ch }))) {
      if (live) return void setChapter(remote, { confirmed: true }); // signed in on an open page
      store.ch = remote;
      history.replaceState(history.state, '', location.hash.replace(/([?&]ch=)\d+/, `$1${remote}`));
    } else if (remote !== store.ch) saveProgress(store.ch);
  } catch { /* offline or not set up: this browser's own state stands */ }
}

function showAccountLink() {
  const a = $('#account-link');
  a.hidden = !ACCOUNTS;
  a.textContent = signedIn() ? 'My account' : 'Sign in';
}

async function boot() {
  applyTheme(storage.get('wiki.theme') || '');
  $('#theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    // colours fade for a moment instead of flashing (PLAN K7); the class is only there for the switch
    const root = document.documentElement;
    root.classList.add('theme-fading');
    clearTimeout(root._fade);
    root._fade = setTimeout(() => root.classList.remove('theme-fading'), 400);
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
  // a link opened further on than the saved chapter is checked first (PLAN K8)
  initConfirm();
  if (saved && store.ch === fromUrl && fromUrl > saved + 1 && chapters.some(c => c.n === saved) && askBeforeJump()
    && !(await confirmChapter(fromUrl, { from: saved }))) {
    store.ch = saved;
    history.replaceState(history.state, '', location.hash.replace(/([?&]ch=)\d+/, `$1${saved}`));
  }
  // PLAN K9: an optional account
  await initAccount();
  if (signedIn()) await syncAccount();
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
  showAccountLink();
  let wasIn = signedIn();
  onAccountChange((on) => {
    showAccountLink();
    renderSidebar(route().path);
    if (on && !wasIn) syncAccount({ live: true }); // a token refresh is no new sign-in
    wasIn = on;
  });
  $('#skip-link').addEventListener('click', () => ($('h1', content) ?? content).focus());

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', render);
  render();
}

boot().catch(err => { content.textContent = `Error: ${err.message}`; });
