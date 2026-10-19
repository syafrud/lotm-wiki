// #/volume/<i> — a started volume as one line per chapter (headline, else title), through the
// reading chapter. Chapters come in groups of 25 (201–225, 226–250, … like the summary
// checkpoints): the group being read is open, the others are folded, with a jump row on top.
import { $, esc, chapterTitle, roman, volumeParts } from '../util.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { notFoundHtml } from '../components/ui.js';

const GROUP = 25;

// 1-based index of the volume the reading chapter is in (volumes not started have no name).
export function currentVolumeIndex() {
  const names = [...new Set(store.chapters.map(c => c.volume).filter(Boolean))];
  const cur = store.chapters.find(c => c.n === store.ch)?.volume;
  return Math.max(1, names.indexOf(cur) + 1);
}

function groupsOf(chapters) {
  const groups = [];
  for (const c of chapters) {
    const start = Math.floor((c.n - 1) / GROUP) * GROUP + 1;
    if (groups.at(-1)?.start !== start) groups.push({ start, chapters: [] });
    groups.at(-1).chapters.push(c);
  }
  return groups;
}

const row = (c) => `<li class="since-row">
  <span class="ch-chip${c.n === store.ch ? ' current' : ''}">ch ${c.n}</span>
  <div><a class="since-title" href="#/?ch=${c.n}">${esc(chapterTitle(c.title))}</a>${c.headline ? `<span>${esc(c.headline)}</span>` : ''}</div></li>`;

export async function volume(i) {
  let v;
  try { v = await api(`/api/volume/${i}?ch=${store.ch}`); } catch (err) { if (err.status === 404) return notFoundHtml(); throw err; }
  const withHeadline = v.chapters.filter(c => c.headline).length;
  const groups = groupsOf(v.chapters);
  const current = groups.find(g => g.chapters.some(c => c.n === store.ch)) ?? groups.at(-1);
  const range = (g) => `${g.chapters[0].n}–${g.chapters.at(-1).n}`;
  const jump = groups.length > 1 ? `<nav class="group-jump" aria-label="Jump to chapters">${groups.map(g =>
    `<button type="button" class="range-chip" data-group="${g.start}" aria-pressed="${g === current}">${range(g)}</button>`).join('')}</nav>` : '';
  const body = groups.length > 1
    ? groups.map(g => `<details class="ch-group" id="ch-group-${g.start}"${g === current ? ' open' : ''}>
        <summary><span class="ch-group-range">Chapters ${range(g)}</span> <span class="muted">${g.chapters.length} chapter${g.chapters.length === 1 ? '' : 's'}</span></summary>
        <ol class="since-list volume-list">${g.chapters.map(row).join('')}</ol>
      </details>`).join('')
    : `<ol class="since-list volume-list">${v.chapters.map(row).join('')}</ol>`;
  return {
    title: v.name,
    html: `
      ${volumeParts(v.name) ? `<span class="kicker">Volume ${roman(volumeParts(v.name).n)}</span>` : ""}
      <h1 tabindex="-1">${esc(volumeParts(v.name)?.name || v.name)}</h1>
      <p class="subtitle">Chapters ${v.start}–${v.end ?? v.chapters.at(-1)?.n ?? v.start}${v.end ? '' : ` so far (through chapter ${store.ch})`} · one line per chapter</p>
      ${jump}
      ${body}
      ${withHeadline < v.chapters.length ? `<p class="muted">${v.chapters.length - withHeadline} chapter${v.chapters.length - withHeadline === 1 ? '' : 's'} without a headline yet.</p>` : ''}`,
    mount(root) {
      const nav = $('.group-jump', root);
      if (!nav) return;
      const mark = () => {
        for (const b of nav.querySelectorAll('[data-group]')) b.setAttribute('aria-pressed', String(!!$(`#ch-group-${b.dataset.group}`, root)?.open));
      };
      nav.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-group]');
        if (!b) return;
        const g = $(`#ch-group-${b.dataset.group}`, root);
        g.open = true;
        g.querySelector('summary').focus({ preventScroll: true });
        g.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      root.addEventListener('toggle', mark, true);
    },
  };
}
