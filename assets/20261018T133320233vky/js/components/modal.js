// The first-visit disclaimer ("Before you read") with a focus trap, and the shared disclaimer text.
import { $, storage } from '../util.js';
import { store } from '../store.js';
import { setChapter } from './picker.js';

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

export function showDisclaimer() {
  $('#disclaimer-text').innerHTML = DISCLAIMER_HTML;
  const input = $('#disclaimer-ch');
  input.max = String(store.chapters.at(-1)?.n ?? 1);
  input.value = String(store.ch ?? 1);
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
  $('#disclaimer-report').addEventListener('click', () => closeDisclaimer());
  modal.addEventListener('click', (ev) => { if (ev.target === modal) closeDisclaimer(); });
  if (!storage.get(KEY)) showDisclaimer();
}
