// "Read up to" picker (design 3a): volume tabs, a chapter number field with ‹ ›, and the titled
// chapter list of the volume, in a sheet opened from the "Reading …" pill (a bottom sheet on
// phones, a drop-down under the pill on wider screens). The server withholds titles after ch + 1
// and the names of volumes not started yet, so the list is refetched whenever the chapter changes.
import { $, esc, chapterTitle, roman, volumeParts } from '../util.js';
import { api } from '../api.js';
import { store, rememberChapter, noteMove } from '../store.js';

const LATER = 'Later chapters';
export const SIDE = 'Side Stories';
// shortcut: the novel's volumes are fixed (8 + Side Stories); read them from the chapter index if the series changes
export const SHELF = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `Volume ${n}`).concat(SIDE);
const tabsEl = $('#volume-tabs');
const list = $('#chapter-list');
const input = $('#chapter-input');
const prev = $('#chapter-prev');
const next = $('#chapter-next');
const pill = $('#reading-pill');
const barPrev = $('#bar-prev');
const barNext = $('#bar-next');
const sheetOverlay = $('#sheet-overlay');
let shownVolume = null; // the volume tab being browsed (null: the one being read)
let active = null;      // the chapter the list's keyboard cursor is on

export async function loadChapters(ch) {
  if (store.chaptersAt === ch) return;
  const chapters = await api(`/api/chapters?ch=${ch}`);
  if (store.ch != null && store.ch !== ch) return; // a later pick already moved on
  store.chapters = chapters;
  store.chaptersAt = ch;
}

// The volume a chapter is in: its name once the volume has started, else only its number
// ("Volume 2"); LATER only for a chapter the server gives no volume.
export const volumeOf = (c) => c?.volume ?? (c?.vol === 'side' ? SIDE : c?.vol ? `Volume ${c.vol}` : LATER);

// Volumes in reading order, each with its chapters.
export function volumes() {
  const out = [];
  for (const c of store.chapters) {
    const name = volumeOf(c);
    let v = out.find(x => x.volume === name);
    if (!v) out.push((v = { volume: name, chapters: [] }));
    v.chapters.push(c);
  }
  return out;
}

// "I · Clown" for a started volume, "II" for one not started yet
export function volumeLabel(volume) {
  if (volume === LATER) return 'Later';
  const p = volumeParts(volume);
  return p ? `${roman(p.n)}${p.name ? ` · ${p.name}` : ''}` : String(volume);
}

const range = (v) => `${v.chapters[0].n}–${v.chapters.at(-1).n}`;

function renderTabs(vols, browsing) {
  tabsEl.innerHTML = vols.map(v => {
    const on = v.volume === browsing;
    return `<button type="button" role="tab" class="vol-tab${v.chapters[0].n > store.ch ? ' later' : ''}" data-volume="${esc(v.volume)}" aria-selected="${on}" tabindex="${on ? 0 : -1}">
      ${esc(volumeLabel(v.volume))} <span class="vol-range">${range(v)}</span></button>`;
  }).join('');
}

function renderList(v) {
  list.innerHTML = (v?.chapters ?? []).slice().reverse().map(c => {
    const reading = c.n === store.ch;
    return `<div class="ch-item${reading ? ' reading' : ''}${c.n > store.ch ? ' ahead' : ''}" role="option" id="ch-opt-${c.n}" data-ch="${c.n}" aria-selected="${reading}">
      <span class="ch-item-n">${c.n}</span><span class="ch-item-title">${c.title ? esc(chapterTitle(c.title)) : '<span class="sealed">not read yet</span>'}</span>${reading ? '<span class="ch-item-tag">reading</span>' : ''}</div>`;
  }).join('');
  setActive(v?.chapters.some(c => c.n === store.ch) ? store.ch : v?.chapters.at(-1)?.n ?? null, { scroll: true });
}

function setActive(n, { scroll = false } = {}) {
  active = n;
  for (const el of list.querySelectorAll('.ch-item.active')) el.classList.remove('active');
  const el = n != null ? $(`#ch-opt-${n}`, list) : null;
  if (el) {
    el.classList.add('active');
    list.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  } else list.removeAttribute('aria-activedescendant');
}

export function syncPickers() {
  const cur = store.chapters.find(c => c.n === store.ch);
  const vols = volumes();
  const reading = volumeOf(cur);
  const browsing = vols.some(v => v.volume === shownVolume) ? shownVolume : reading;
  renderTabs(vols, browsing);
  renderList(vols.find(v => v.volume === browsing) ?? vols[0]);
  input.max = String(store.chapters.at(-1)?.n ?? 1);
  if (document.activeElement !== input) input.value = String(store.ch ?? '');
  const i = store.chapters.findIndex(c => c.n === store.ch);
  prev.disabled = barPrev.disabled = i <= 0;
  next.disabled = barNext.disabled = i === -1 || i >= store.chapters.length - 1;
  $('#reading-pill-ch').textContent = `Ch ${store.ch}`;
  // "Reading Vol II · Ch 321 Appearance of a Living Person" (design 1a)
  const p = volumeParts(cur?.volume);
  $('#reading-pill-vol').textContent = p ? `Vol ${roman(p.n)} · ` : '';
  $('#reading-pill-vol-phone').textContent = p ? ` · Vol ${roman(p.n)}` : '';
  $('#reading-pill-title').textContent = cur?.title ? chapterTitle(cur.title) : '';
}

// ---- the sheet: a drop-down under the pill, a bottom sheet on phones ----

export const sheetOpen = () => document.body.classList.contains('sheet-open');

export function openSheet() {
  shownVolume = null;
  syncPickers();
  document.body.classList.add('sheet-open');
  sheetOverlay.hidden = false;
  pill.setAttribute('aria-expanded', 'true');
  const sheet = $('#chapter-sheet');
  sheet.style.left = matchMedia('(min-width: 761px)').matches ? `${Math.max(8, Math.min(pill.getBoundingClientRect().left, innerWidth - sheet.offsetWidth - 8))}px` : '';
  void sheet.offsetHeight; // the sheet is visibility:hidden until the class applies: flush, then focus
  list.focus({ preventScroll: true });
  setActive(active, { scroll: true });
}

export function closeSheet({ restoreFocus = true } = {}) {
  if (!sheetOpen()) return;
  document.body.classList.remove('sheet-open');
  sheetOverlay.hidden = true;
  pill.setAttribute('aria-expanded', 'false');
  if (restoreFocus) pill.focus();
}

// Change the reading chapter; navigate: also put it in the URL (which re-renders the page).
export function setChapter(ch, { navigate = true } = {}) {
  ch = Number(ch);
  if (!store.chapters.some(c => c.n === ch)) return;
  if (ch !== store.ch) noteMove(store.ch, ch);
  store.ch = ch;
  syncPickers();
  loadChapters(ch).then(syncPickers).catch(() => {});
  rememberChapter(ch);
  if (navigate) {
    const [pathPart, query = ''] = location.hash.split('?');
    const params = new URLSearchParams(query);
    params.set('ch', String(ch));
    location.hash = `${pathPart || '#/'}?${params}`;
  }
}

export function stepChapter(delta) {
  const i = store.chapters.findIndex(c => c.n === store.ch);
  const target = store.chapters[i + delta];
  if (target) setChapter(target.n);
}

function pick(n) {
  setChapter(n);
  closeSheet();
}

export function initPicker() {
  tabsEl.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-volume]');
    if (!tab) return;
    shownVolume = tab.dataset.volume;
    syncPickers();
    $(`[data-volume="${CSS.escape(shownVolume)}"]`, tabsEl)?.focus();
  });
  tabsEl.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    ev.stopPropagation(); // not the next/previous chapter
    const tabs = [...tabsEl.querySelectorAll('[role=tab]')];
    const i = tabs.indexOf(document.activeElement);
    tabs[(i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]?.click();
  });
  list.addEventListener('click', (ev) => {
    const item = ev.target.closest('[data-ch]');
    if (item) pick(Number(item.dataset.ch));
  });
  list.addEventListener('keydown', (ev) => {
    const items = [...list.querySelectorAll('[data-ch]')];
    if (!items.length) return;
    const i = Math.max(0, items.findIndex(el => Number(el.dataset.ch) === active));
    const go = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[ev.key];
    if (go) { ev.preventDefault(); setActive(Number(items[Math.min(items.length - 1, Math.max(0, i + go))].dataset.ch), { scroll: true }); }
    else if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); setActive(Number(items[ev.key === 'Home' ? 0 : items.length - 1].dataset.ch), { scroll: true }); }
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (active != null) pick(active); }
  });
  input.addEventListener('change', () => setChapter(input.value));
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); setChapter(input.value); closeSheet(); } });
  prev.addEventListener('click', () => stepChapter(-1));
  next.addEventListener('click', () => stepChapter(1));
  barPrev.addEventListener('click', () => stepChapter(-1));
  barNext.addEventListener('click', () => stepChapter(1));
  pill.addEventListener('click', () => (sheetOpen() ? closeSheet() : openSheet()));
  $('#sheet-close').addEventListener('click', () => closeSheet());
  sheetOverlay.addEventListener('click', () => closeSheet());
  $('#sheet-theme').addEventListener('click', () => $('#theme-toggle').click());
}
