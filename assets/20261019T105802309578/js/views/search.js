// #/search?q= (design 6a) — one result per entity, grouped by section (name matches first inside
// each), with the field that matched; chips filter to one section. Bounded by the reading chapter.
import { esc, markSnippet } from '../util.js';
import { api } from '../api.js';
import { store, sectionOf, fieldLabel, sectionTitle, shortTitle } from '../store.js';

const LIMIT = 100;
// a reference value ("characters:mr_azik") reads as the id in words ("→ mr azik"); the match marks stay
const plainRefs = (s) => String(s).replace(/\b[a-z_]+:([a-z0-9_\u0001\u0002]+)/g, (m, id) => `→ ${id.replace(/_/g, ' ')}`);
import { entityLink } from '../components/ui.js';
import { replaceQuery } from '../router.js';

export async function search(q, params = new URLSearchParams()) {
  const results = q ? await api(`/api/search?q=${encodeURIComponent(q)}&ch=${store.ch}&limit=${LIMIT}`) : [];
  const count = `${results.length}${results.length === LIMIT ? '+' : ''}`;
  const order = store.schema.sections.map(s => s.key);
  const groups = order.map(key => ({ key, items: results.filter(r => r.section === key) })).filter(g => g.items.length);
  const only = groups.some(g => g.key === params.get('in')) ? params.get('in') : '';
  const chips = groups.length > 1 ? `<div class="filters search-filters" role="group" aria-label="Sections">
      <button type="button" class="pill" data-in="" aria-pressed="${!only}">All <span class="pill-n">${count}</span></button>
      ${groups.map(g => `<button type="button" class="pill" data-in="${g.key}" aria-pressed="${only === g.key}">${esc(shortTitle(g.key))} <span class="pill-n">${g.items.length}</span></button>`).join('')}
    </div>` : '';
  const body = groups.map(g => {
    const sec = sectionOf(g.key);
    return `<section class="result-group" data-group="${g.key}"${only && only !== g.key ? ' hidden' : ''}>
      <h2 class="kicker">${esc(sectionTitle(g.key))}</h2>
      ${g.items.map(r => {
        const more = r.hits > 1 ? ` <span class="muted">+${r.hits - 1} more match${r.hits === 2 ? '' : 'es'}</span>` : '';
        return `<div class="result">
          <div class="result-head">${entityLink(r.section, r.id, r.heading)}<span class="result-ch">ch ${r.ch}</span></div>
          <div class="snippet"><span class="result-field">${esc(fieldLabel(sec, r.field))}</span> · ${markSnippet(plainRefs(r.snippet))}${more}</div></div>`;
      }).join('')}
    </section>`;
  }).join('');
  return {
    title: q ? `Search: ${q}` : 'Search',
    html: `<div class="search-page">
      <h1 tabindex="-1">Search</h1>
      <p class="subtitle" role="status">${q ? `${count} result${results.length === 1 ? '' : 's'} for “${esc(q)}” through ch ${store.ch}` : 'Press / or the search button to search the casebook.'}</p>
      ${chips}
      ${body}
    </div>`,
    mount(root) {
      root.querySelector('.search-filters')?.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-in]');
        if (!b) return;
        const key = b.dataset.in;
        for (const p of root.querySelectorAll('[data-in]')) p.setAttribute('aria-pressed', String(p === b));
        for (const g of root.querySelectorAll('.result-group')) g.hidden = !!key && g.dataset.group !== key;
        replaceQuery({ in: key || null });
      });
    },
  };
}
