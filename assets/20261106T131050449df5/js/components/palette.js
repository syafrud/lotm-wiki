// Search palette (design 6b): "/" or the search button opens it over the page; results come as
// you type (/api/search, chapter-bounded like every answer), ↑↓ move, ↵ opens, Esc closes. A
// number offers to read up to that chapter; the last row always opens the full results page.
import { $, esc, chapterTitle } from '../util.js';
import { api } from '../api.js';
import { store, sectionOf } from '../store.js';
import { setChapter } from './picker.js';

const LIMIT = 7;
const palette = $('#palette');
const input = $('#search-input');
const listEl = $('#palette-list');
const trigger = $('#search-toggle');
let items = [];     // [{ label, html, go() }]
let active = 0;
let token = 0;
let timer = null;
let returnFocus = null;
let pending = false;  // typed since the last update: Enter searches instead of picking a stale row

export const paletteOpen = () => !palette.hidden;

const sectionWord = (key) => String(sectionOf(key)?.label ?? key).split(' /')[0];

function render() {
  listEl.innerHTML = items.map((it, i) => `<div class="palette-item${i === active ? ' active' : ''}" role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === active}">
      <span class="palette-kind">${esc(it.kind)}</span><span class="palette-text">${it.html}</span>${i === active ? '<span class="palette-enter" aria-hidden="true">↵</span>' : ''}</div>`).join('');
  input.setAttribute('aria-expanded', String(items.length > 0));
  if (items.length) input.setAttribute('aria-activedescendant', `pal-${active}`); else input.removeAttribute('aria-activedescendant');
  $(`#pal-${active}`, listEl)?.scrollIntoView({ block: 'nearest' });
}

async function update() {
  const q = input.value.trim();
  const my = ++token;
  const out = [];
  const n = /^\d+$/.test(q) ? Number(q) : null;
  const chapter = n != null ? store.chapters.find(c => c.n === n) : null;
  if (chapter) {
    out.push({ kind: 'Go to', html: `Read up to chapter ${n}${chapter.title ? ` <span class="muted">· ${esc(chapterTitle(chapter.title))}</span>` : ''}`, go: () => setChapter(n) });
  }
  if (q.length >= 2) {
    let results = [];
    try { results = await api(`/api/search?q=${encodeURIComponent(q)}&ch=${store.ch}&limit=${LIMIT}`); } catch {}
    if (my !== token) return;
    for (const r of results.slice(0, LIMIT)) {
      out.push({ kind: sectionWord(r.section), html: `${esc(r.heading)}`, go: () => { location.hash = `#/e/${r.section}/${encodeURIComponent(r.id)}?ch=${store.ch}`; } });
    }
  }
  if (q) out.push({ kind: 'Search', html: `All results for “${esc(q)}”`, go: () => { location.hash = `#/search?q=${encodeURIComponent(q)}&ch=${store.ch}`; } });
  if (my !== token) return;
  items = out;
  active = 0;
  pending = false;
  render();
}

export function openPalette() {
  if (paletteOpen()) return input.focus();
  returnFocus = document.activeElement;
  palette.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  $('#palette-scope').textContent = `only facts through ch ${store.ch}`;
  input.focus();
  input.select();
  update();
}

export function closePalette({ restoreFocus = true } = {}) {
  if (!paletteOpen()) return;
  palette.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) (returnFocus?.isConnected ? returnFocus : trigger).focus?.();
}

function choose(i) {
  const it = items[i];
  if (!it) return;
  closePalette({ restoreFocus: false });
  it.go();
}

export function initPalette() {
  trigger.addEventListener('click', () => openPalette());
  $('#palette-close').addEventListener('click', () => closePalette());
  palette.addEventListener('mousedown', (ev) => { if (ev.target === palette) closePalette(); });
  input.addEventListener('input', () => { pending = true; clearTimeout(timer); timer = setTimeout(update, 140); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!items.length) return;
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      $('#search-form').requestSubmit();
    } else if (ev.key === 'Tab') {
      ev.preventDefault(); // the dialog has one field; Tab stays in it
    }
  });
  $('#search-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    clearTimeout(timer);
    const q = input.value.trim();
    if (items.length && !pending) return choose(active);
    if (q) { closePalette({ restoreFocus: false }); location.hash = `#/search?q=${encodeURIComponent(q)}&ch=${store.ch}`; }
  });
  listEl.addEventListener('mousemove', (ev) => {
    const el = ev.target.closest('[data-i]');
    if (el && Number(el.dataset.i) !== active) { active = Number(el.dataset.i); render(); }
  });
  listEl.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-i]');
    if (el) choose(Number(el.dataset.i));
  });
}
