// The first-visit disclaimer ("Before you read") with a focus trap, and the shared disclaimer text.
import { $, esc, storage, volumeParts } from '../util.js';
import { store } from '../store.js';
import { setChapter, volumes, volumeLabel, SHELF, SIDE } from './picker.js';
import { confirmChapter } from './confirm.js';

// One source for the text shown in the first-visit popup and on the About page.
export const DISCLAIMER_HTML = `
  <p>This wiki is made <span class="hl">by and for readers who want a wiki without spoilers</span>:
  every page shows only what is known up to the chapter you pick.</p>
  <p>It is built together with the Claude AI, which <span class="hl">reads each chapter and writes
  the summaries</span> behind every entry, so some details may be <span class="hl">wrong or missing</span>.
  Sorry about that — please send corrections and suggestions on the <span class="hl">Report</span> page.</p>
  <p>This is <span class="hl">a hobby project</span> done in spare time, so new chapters may arrive
  slowly or pause for a while. Thanks for your patience — everything already here keeps working.</p>
  <p>Want everything at once? The <a href="https://lordofthemysteries.fandom.com/" target="_blank" rel="noopener">Lord of the Mysteries
  Wiki on Fandom</a> is far more complete, but <span class="hl">it is full of spoilers</span>.</p>`;

const KEY = 'wiki.disclaimer.v1';
const modal = $('#disclaimer');
let returnFocus = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Keep Tab inside the dialog while it is open.
function trap(ev) {
  if (ev.key !== 'Tab') return;
  const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}

export const modalOpen = () => !modal.hidden;

// The shelf (design 3b): one spine per volume (names only for volumes already started, from the
// chapter list as the server gives it), and a slider over the chosen volume's chapters.
function shelfVolume(n) {
  const vols = volumes();
  return vols.find(v => v.chapters.some(c => c.n === n)) ?? vols[0];
}

function syncShelf(n, { fromRange = false } = {}) {
  const v = shelfVolume(n);
  if (!v) return;
  for (const b of modal.querySelectorAll('.spine')) {
    const on = b.dataset.volume === v.volume;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  const range = $('#disclaimer-range');
  range.min = String(v.chapters[0].n);
  range.max = String(v.chapters.at(-1).n);
  if (!fromRange) range.value = String(n);
  $('#disclaimer-min').textContent = String(v.chapters[0].n);
  $('#disclaimer-max').textContent = `${v.chapters.at(-1).n}${v === volumes().at(-1) ? ' · latest in the wiki' : ''}`;
  $('#disclaimer-vol-label').textContent = `${v.volume === SIDE ? SIDE : `Volume ${volumeLabel(v.volume)}`} · I have read up to chapter`;
  $('#disclaimer-vol-info').textContent = volumeInfo(v);
  $('#disclaimer-ok').textContent = `Open the casebook at ch ${n}`;
}

// "Volume I · Clown — 213 chapters (ch 1–213)"; the last volume in the wiki may still be growing
function volumeInfo(v) {
  if (!v.chapters.length) return 'Not in the wiki yet';
  const label = v.volume === SIDE ? SIDE : `Volume ${volumeLabel(v.volume)}`;
  const a = v.chapters[0].n, b = v.chapters.at(-1).n, count = v.chapters.length;
  return v === volumes().at(-1)
    ? `${label} — ch ${a}–${b} in the wiki so far (${count} chapter${count === 1 ? '' : 's'})`
    : `${label} — ${count} chapter${count === 1 ? '' : 's'} (ch ${a}–${b})`;
}

// the shelf's choice, checked once more before the casebook opens on it
async function pickChapter() {
  const n = Number($('#disclaimer-ch').value);
  if (!store.chapters.some(c => c.n === n)) return;
  if (await confirmChapter(n)) closeDisclaimer({ pick: true });
}

export function showDisclaimer() {
  $('#disclaimer-text').innerHTML = DISCLAIMER_HTML;
  // every volume of the novel; one with no chapter in the wiki yet is shown but cannot be picked
  const vols = volumes();
  const keyOf = (name) => (volumeParts(name) ? `Volume ${volumeParts(name).n}` : name); // "Volume 1: Clown" → "Volume 1"
  const shelf = SHELF.map(key => vols.find(v => keyOf(v.volume) === key) ?? { volume: key, chapters: [] });
  $('#disclaimer-shelf').innerHTML = shelf.map((v, i) => {
    const missing = !v.chapters.length;
    const later = missing || v.chapters[0].n > (store.ch ?? 1);
    return `<button type="button" class="spine${later ? ' later' : ''}${missing ? ' missing' : ''}" role="radio" data-volume="${esc(v.volume)}" aria-checked="false"${missing ? ' aria-disabled="true"' : ''} title="${esc(volumeInfo(v))}" style="--h:${78 + (i % 3) * 8}%">
      <span>${esc(v.volume === SIDE ? 'Side' : volumeLabel(v.volume))}</span></button>`;
  }).join('');
  const input = $('#disclaimer-ch');
  input.max = String(store.chapters.at(-1)?.n ?? 1);
  input.value = String(store.ch ?? 1);
  syncShelf(store.ch ?? 1);
  returnFocus = document.activeElement;
  modal.hidden = false;
  modal.addEventListener('keydown', trap);
  input.focus();
  input.select();
}

export function closeDisclaimer({ pick = false } = {}) {
  if (!modalOpen()) return;
  modal.hidden = true;
  modal.removeEventListener('keydown', trap);
  storage.set(KEY, '1');
  const n = Number($('#disclaimer-ch').value);
  if (pick && n !== store.ch && store.chapters.some(c => c.n === n)) setChapter(n, { confirmed: true });
  returnFocus?.focus?.();
}

export function resetDisclaimer() { storage.remove(KEY); }

export function initModal() {
  $('#disclaimer-ok').addEventListener('click', pickChapter);
  $('#disclaimer-ch').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pickChapter(); });
  $('#disclaimer-ch').addEventListener('input', (ev) => {
    const n = Number(ev.target.value);
    if (store.chapters.some(c => c.n === n)) syncShelf(n);
  });
  $('#disclaimer-range').addEventListener('input', (ev) => {
    $('#disclaimer-ch').value = ev.target.value;
    syncShelf(Number(ev.target.value), { fromRange: true });
  });
  $('#disclaimer-shelf').addEventListener('click', (ev) => {
    const b = ev.target.closest('.spine');
    if (!b) return;
    const v = volumes().find(x => x.volume === b.dataset.volume);
    if (!v) return; // not in the wiki yet
    // a started volume opens at its last chapter, one not started yet at its first
    const n = b.classList.contains('later') ? v.chapters[0].n : v.chapters.at(-1).n;
    $('#disclaimer-ch').value = String(n);
    syncShelf(n);
  });
  $('#disclaimer-shelf').addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const spines = [...modal.querySelectorAll('.spine:not(.missing)')];
    const i = spines.indexOf(document.activeElement);
    const to = spines[(i + (ev.key === 'ArrowRight' ? 1 : -1) + spines.length) % spines.length];
    to?.click();
    to?.focus();
  });
  $('#disclaimer-report').addEventListener('click', () => closeDisclaimer());
  // no closing on a click outside the card: a slip while scrolling the shelf must not open the page
  if (!storage.get(KEY)) showDisclaimer();
}
