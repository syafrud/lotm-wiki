// The first-visit disclaimer ("Before you read") with a focus trap, and the shared disclaimer text.
import { $, esc, storage } from '../util.js';
import { store } from '../store.js';
import { setChapter, volumes, volumeLabel } from './picker.js';

// One source for the text shown in the first-visit popup and on the About page.
export const DISCLAIMER_HTML = `
  <p>This wiki is made <span class="hl">by and for readers who want a wiki without spoilers</span>:
  every page shows only what is known up to the chapter you pick.</p>
  <p>It is built together with the Claude AI, which <span class="hl">reads each chapter and writes
  the summaries</span> behind every entry, so some details may be <span class="hl">wrong or missing</span>.
  Sorry about that — please send corrections and suggestions on the <span class="hl">Report</span> page.</p>
  <p>This is <span class="hl">a hobby project</span> done in spare time, so new chapters may arrive
  slowly or pause for a while. Thanks for your patience — everything already here keeps working.</p>`;

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
  $('#disclaimer-vol-label').textContent = `${volumeLabel(v.volume) === 'Later' ? 'Later chapters' : `Volume ${volumeLabel(v.volume)}`} · I have read up to chapter`;
  $('#disclaimer-ok').textContent = `Open the casebook at ch ${n}`;
}

export function showDisclaimer() {
  $('#disclaimer-text').innerHTML = DISCLAIMER_HTML;
  const vols = volumes();
  const last = vols.length - 1;
  $('#disclaimer-shelf').innerHTML = vols.map((v, i) => `<button type="button" class="spine${i === last && v.volume === 'Later chapters' ? ' later' : ''}" role="radio" data-volume="${esc(v.volume)}" aria-checked="false" style="--h:${78 + (i % 3) * 8}%">
      <span>${esc(volumeLabel(v.volume))}</span></button>`).join('');
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
  if (pick && n !== store.ch && store.chapters.some(c => c.n === n)) setChapter(n);
  returnFocus?.focus?.();
}

export function resetDisclaimer() { storage.remove(KEY); }

export function initModal() {
  $('#disclaimer-ok').addEventListener('click', () => closeDisclaimer({ pick: true }));
  $('#disclaimer-ch').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') closeDisclaimer({ pick: true }); });
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
    if (!v) return;
    // a started volume opens at its last chapter, "Later" at its first
    const n = b.classList.contains('later') ? v.chapters[0].n : v.chapters.at(-1).n;
    $('#disclaimer-ch').value = String(n);
    syncShelf(n);
  });
  $('#disclaimer-shelf').addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const spines = [...modal.querySelectorAll('.spine')];
    const i = spines.indexOf(document.activeElement);
    const to = spines[(i + (ev.key === 'ArrowRight' ? 1 : -1) + spines.length) % spines.length];
    to?.click();
    to?.focus();
  });
  $('#disclaimer-report').addEventListener('click', () => closeDisclaimer());
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeDisclaimer(); });
  if (!storage.get(KEY)) showDisclaimer();
}
