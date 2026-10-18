// "Read up to" picker: volume + chapter selects and the ‹ › buttons.
// The server withholds titles after ch + 1 and the names of volumes not started yet, so the list
// is refetched whenever the reading chapter changes.
import { $, esc, storage } from '../util.js';
import { api } from '../api.js';
import { store, rememberChapter, noteMove } from '../store.js';

const LATER = 'Later chapters';
const select = $('#chapter-select');
const volSelect = $('#volume-select');
const prev = $('#chapter-prev');
const next = $('#chapter-next');
const pill = $('#reading-pill');
const sheetOverlay = $('#sheet-overlay');

export async function loadChapters(ch) {
  if (store.chaptersAt === ch) return;
  const list = await api(`/api/chapters?ch=${ch}`);
  if (store.ch != null && store.ch !== ch) return; // a later pick already moved on
  store.chapters = list;
  store.chaptersAt = ch;
}

// Volumes in reading order, each with its chapters; chapters of volumes not started yet are
// grouped under LATER.
export function volumes() {
  const out = [];
  for (const c of store.chapters) {
    const name = c.volume ?? LATER;
    let v = out.find(x => x.volume === name);
    if (!v) out.push((v = { volume: name, chapters: [] }));
    v.chapters.push(c);
  }
  return out;
}

export function syncPickers() {
  const cur = store.chapters.find(c => c.n === store.ch);
  const vols = volumes();
  volSelect.innerHTML = vols.map(v => `<option value="${esc(v.volume)}">${esc(v.volume)}</option>`).join('');
  volSelect.value = cur?.volume ?? LATER;
  const v = vols.find(x => x.volume === volSelect.value) ?? vols[0];
  select.innerHTML = (v?.chapters ?? []).map(c => `<option value="${c.n}">Ch ${c.n}${c.title ? ': ' + esc(c.title) : ''}</option>`).join('');
  select.value = String(store.ch);
  const i = store.chapters.findIndex(c => c.n === store.ch);
  prev.disabled = i <= 0;
  next.disabled = i === -1 || i >= store.chapters.length - 1;
  $('#reading-pill-ch').textContent = `Ch ${store.ch}`;
}

// ---- phones: the picker is a bottom sheet opened from the "Reading Ch N" pill ----

export const sheetOpen = () => document.body.classList.contains('sheet-open');

export function openSheet() {
  document.body.classList.add('sheet-open');
  sheetOverlay.hidden = false;
  pill.setAttribute('aria-expanded', 'true');
  // the sheet is visibility:hidden until the new class applies: flush styles, then focus
  void $('#chapter-sheet').offsetHeight;
  select.focus();
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

export function initPicker() {
  select.addEventListener('change', () => setChapter(select.value));
  volSelect.addEventListener('change', () => {
    // switching volume jumps to the last chapter of that volume (or the remembered one inside it);
    // "Later chapters" goes only to the first chapter not read yet
    const v = volumes().find(x => x.volume === volSelect.value);
    if (!v) return;
    const remembered = Number(storage.get('wiki.ch.' + v.volume));
    setChapter(v.chapters.some(c => c.n === remembered) ? remembered : v.volume === LATER ? v.chapters[0].n : v.chapters.at(-1).n);
  });
  prev.addEventListener('click', () => stepChapter(-1));
  next.addEventListener('click', () => stepChapter(1));
  pill.addEventListener('click', () => (sheetOpen() ? closeSheet() : openSheet()));
  $('#sheet-close').addEventListener('click', () => closeSheet());
  sheetOverlay.addEventListener('click', () => closeSheet());
  $('#sheet-theme').addEventListener('click', () => $('#theme-toggle').click());
}
