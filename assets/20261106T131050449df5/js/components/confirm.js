// One check before showing a chapter further on (PLAN K0/K8): the volume, the chapter and, when the
// reader may see it, its title; Yes or Back. Used by the first-visit shelf, by jumps of more than one
// chapter ahead (picker, search, a pasted link) and by a link opened further than the saved chapter.
// A click outside does nothing (a slip there must not show a later chapter); Escape is Back.
import { $, esc, storage, chapterTitle } from '../util.js';
import { store } from '../store.js';
import { volumeOf, volumeLabel, SIDE } from './picker.js';

const box = $('#confirm-ch');
let done = null;
let returnFocus = null;

export const confirmOpen = () => !box.hidden;
// the reader's setting (About → Settings); on unless turned off
export const askBeforeJump = () => storage.get('wiki.confirmJump') !== 'off';

// → Promise<boolean>: true when the reader chose Yes
export function confirmChapter(n, { from = null } = {}) {
  if (done) closeConfirm(false);
  const c = store.chapters.find(x => x.n === n);
  const vol = volumeOf(c);
  const label = vol === SIDE ? SIDE : `Volume ${volumeLabel(vol)}`;
  // a title is only shown up to one chapter past where the reader is (the server's own rule)
  const title = c?.title && n <= (from ?? store.ch ?? 0) + 1 ? ` — <em>${esc(chapterTitle(c.title))}</em>` : '';
  $('#confirm-title').textContent = from != null ? `Jump ahead to chapter ${n}?` : `Open chapter ${n}?`;
  $('#confirm-text').innerHTML = `${esc(label)}, chapter ${n}${title}${from != null ? ` (you are at ch ${from})` : ''}.
    Everything up to this chapter will be shown, nothing after it.`;
  $('#confirm-yes').textContent = `Yes, open ch ${n}`;
  returnFocus = document.activeElement;
  box.hidden = false;
  $('#confirm-yes').focus();
  return new Promise((resolve) => { done = resolve; });
}

export function closeConfirm(ok = false) {
  if (box.hidden) return;
  box.hidden = true;
  const resolve = done;
  done = null;
  returnFocus?.focus?.();
  resolve?.(ok);
}

export function initConfirm() {
  $('#confirm-yes').addEventListener('click', () => closeConfirm(true));
  $('#confirm-back').addEventListener('click', () => closeConfirm(false));
  // keep Tab between the two buttons
  box.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    ev.preventDefault();
    (document.activeElement === $('#confirm-yes') ? $('#confirm-back') : $('#confirm-yes')).focus();
  });
}
