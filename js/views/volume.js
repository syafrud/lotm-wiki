// #/volume/<i> — a started volume as one line per chapter (headline, else title), through the
// reading chapter.
import { esc } from '../util.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { notFoundHtml } from '../components/ui.js';

// 1-based index of the volume the reading chapter is in (volumes not started have no name).
export function currentVolumeIndex() {
  const names = [...new Set(store.chapters.map(c => c.volume).filter(Boolean))];
  const cur = store.chapters.find(c => c.n === store.ch)?.volume;
  return Math.max(1, names.indexOf(cur) + 1);
}

export async function volume(i) {
  let v;
  try { v = await api(`/api/volume/${i}?ch=${store.ch}`); } catch (err) { if (err.status === 404) return notFoundHtml(); throw err; }
  const withHeadline = v.chapters.filter(c => c.headline).length;
  return {
    title: v.name,
    html: `
      <h1 tabindex="-1">${esc(v.name)}</h1>
      <p class="subtitle">Chapters ${v.start}–${v.end ?? v.chapters.at(-1)?.n ?? v.start}${v.end ? '' : ` so far (through chapter ${store.ch})`} · one line per chapter</p>
      <ol class="since-list volume-list">${v.chapters.map(c => `<li class="since-row">
        <span class="ch-chip${c.n === store.ch ? ' current' : ''}">ch ${c.n}</span>
        <div><a class="since-title" href="#/?ch=${c.n}">${esc(c.title)}</a>${c.headline ? `<span>${esc(c.headline)}</span>` : ''}</div></li>`).join('')}</ol>
      ${withHeadline < v.chapters.length ? `<p class="muted">${v.chapters.length - withHeadline} chapter${v.chapters.length - withHeadline === 1 ? '' : 's'} without a headline yet.</p>` : ''}`,
  };
}
