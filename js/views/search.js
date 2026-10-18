// #/search?q= — one result per entity; name matches first.
import { esc, markSnippet } from '../util.js';
import { api } from '../api.js';
import { store, sectionOf, fieldLabel } from '../store.js';
import { chip, entityLink } from '../components/ui.js';

export async function search(q) {
  const results = q ? await api(`/api/search?q=${encodeURIComponent(q)}&ch=${store.ch}`) : [];
  const list = results.map(r => {
    const sec = sectionOf(r.section);
    const more = r.hits > 1 ? ` <span class="muted">+${r.hits - 1} more match${r.hits === 2 ? '' : 'es'}</span>` : '';
    return `<div class="result">
      ${entityLink(r.section, r.id, r.heading)}
      <span class="chip">${esc(sec?.label ?? r.section)}</span> ${chip(r.ch)}
      <div class="snippet"><span class="muted">${esc(fieldLabel(sec, r.field))}:</span> ${markSnippet(r.snippet)}${more}</div></div>`;
  }).join('');
  return {
    title: q ? `Search: ${q}` : 'Search',
    html: `
      <h1 tabindex="-1">Search</h1>
      <p class="subtitle" role="status">${q ? `${results.length} result${results.length === 1 ? '' : 's'} for “${esc(q)}” through chapter ${store.ch}` : 'Type in the search box above.'}</p>
      ${list}`,
  };
}
