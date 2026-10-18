// #/s/<key> — a section through the reading chapter (mockup 03): importance chips, sort, List |
// Cards, name filter, and a compact table paged 50 rows at a time. Filters live in the hash
// (imp=, sort=, view=, q=) and in localStorage per section. Locations stay a tree.
import { $, esc, enumLabel, storage } from '../util.js';
import { api } from '../api.js';
import { store, sectionOf, sectionTitle } from '../store.js';
import { chip, entityLink, groupedCards, link, metaChips, notFoundHtml } from '../components/ui.js';
import { replaceQuery } from '../router.js';

const PAGE = 50;
const STALE_AFTER = 50;
const IMPS = ['major', 'notable', 'minor'];
const SORTS = [['last', 'Recently seen'], ['appearances', 'Most chapters'], ['name', 'A–Z']];
const DEFAULTS = { imp: 'major,notable', sort: 'last', view: 'list', q: '' };

const stale = (r) => store.ch - r.last_ch > STALE_AFTER;

// Filters from the hash, else from this section's last visit, else the defaults.
function readFilters(key, params) {
  let saved = {};
  try { saved = JSON.parse(storage.get(`wiki.section.${key}`) ?? '{}'); } catch {}
  const pick = (k) => params.has(k) ? params.get(k) : saved[k] ?? DEFAULTS[k];
  const imp = pick('imp').split(',').filter(i => IMPS.includes(i));
  return {
    imp: imp.length ? imp : DEFAULTS.imp.split(','),
    sort: SORTS.some(([s]) => s === pick('sort')) ? pick('sort') : DEFAULTS.sort,
    view: ['list', 'cards'].includes(pick('view')) ? pick('view') : DEFAULTS.view,
    q: pick('q') ?? '',
  };
}

function saveFilters(key, f) {
  const out = { imp: f.imp.join(','), sort: f.sort, view: f.view, q: f.q };
  storage.set(`wiki.section.${key}`, JSON.stringify(out));
  replaceQuery({
    imp: out.imp === DEFAULTS.imp ? null : out.imp,
    sort: out.sort === DEFAULTS.sort ? null : out.sort,
    view: out.view === DEFAULTS.view ? null : out.view,
    q: out.q || null,
  });
}

const url = (key, f, extra = '') =>
  `/api/section/${key}?ch=${store.ch}&imp=${f.imp.join(',')}&sort=${f.sort}${f.q ? `&q=${encodeURIComponent(f.q)}` : ''}${extra}`;

function tableRows(key, rows, maxApps) {
  return rows.map(r => `<tr class="${stale(r) ? 'stale' : ''}">
    <th scope="row">${entityLink(key, r.id, r.meta?.name ?? r.heading)}
      ${r.isNew ? '<span class="chip new">new</span>' : ''}${r.meta?.importance === 'major' ? '<span class="chip imp-major">major</span>' : ''}</th>
    <td>${esc(r.meta?.title && r.meta.title !== r.meta.name ? r.meta.title : '—')}</td>
    <td>${r.meta?.status && r.meta.status !== 'not_applicable' ? esc(enumLabel(r.meta.status)) : '—'}</td>
    <td class="num">ch ${r.last_ch}</td>
    <td class="apps"><span class="num">${r.appearances}</span><span class="bar" aria-hidden="true"><span style="width:${Math.max(4, Math.round(100 * r.appearances / Math.max(1, maxApps)))}%"></span></span></td>
  </tr>`).join('');
}

function tableHtml(key, data, rows) {
  if (!rows.length) return '<p class="empty">Nothing matches these filters.</p>';
  const left = data.total - rows.length;
  return `<table class="rows-table">
      <caption class="sr-only">${esc(sectionTitle(key))} known through chapter ${store.ch}</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Last seen</th><th scope="col">Chapters</th></tr></thead>
      <tbody>${tableRows(key, rows, data.max_appearances)}</tbody>
    </table>
    <div class="table-foot">
      ${data.stale ? `<span class="legend"><span class="swatch" aria-hidden="true"></span>Faded rows: not seen in the last ${STALE_AFTER} chapters (${data.stale} of ${data.total})</span>` : '<span></span>'}
      ${left > 0 ? `<button type="button" class="btn btn-outline" id="rows-more">Load more <span class="muted">(${left} left)</span></button>` : ''}
    </div>`;
}

function cardsHtml(key, data) {
  const sec = sectionOf(key);
  const rows = new Map(data.rows.map(r => [r.id, r]));
  const withRows = (g) => ({ ...g, entries: g.entries.map(id => rows.get(id)).filter(Boolean), children: (g.children ?? []).map(withRows) });
  return groupedCards(sec, data.groups.map(withRows));
}

function treeHtml(data) {
  if (!data.rows.length) return '<p class="empty">Nothing matches this filter.</p>';
  const rows = new Map(data.rows.map(r => [r.id, r]));
  const ordered = (data.groups[0]?.entries ?? []).map(id => rows.get(id)).filter(Boolean);
  return `<ul class="loc-tree">${ordered.map(e => `
    <li style="--depth:${e.depth ?? 0}" class="${stale(e) ? 'stale' : ''}">
      ${entityLink('locations', e.id, e.heading)}
      ${metaChips(e.meta)} ${chip(e.first_ch)}
      ${e.path?.length && data.filtered ? `<span class="muted path">in ${esc(e.path.join(' › '))}</span>` : ''}
    </li>`).join('')}</ul>`;
}

export async function section(key, params) {
  const sec = sectionOf(key);
  if (!sec) return notFoundHtml();
  const isTree = key === 'locations';
  const f = readFilters(key, params);
  const counts = await api(`/api/counts?ch=${store.ch}`);
  const c = counts.sections.find(s => s.key === key) ?? { total: 0, new: 0 };

  const fetchData = () => isTree
    ? api(`/api/section/${key}?ch=${store.ch}&view=groups${f.q ? `&q=${encodeURIComponent(f.q)}` : ''}`)
    : api(f.view === 'cards' ? url(key, f, '&view=groups') : url(key, f, `&limit=${PAGE}`));
  let data = await fetchData();
  let rows = data.rows;

  const results = () => isTree ? treeHtml({ ...data, filtered: !!f.q }) : f.view === 'cards' ? cardsHtml(key, data) : tableHtml(key, data, rows);
  const toolbar = () => isTree ? '' : `
    <div class="toolbar">
      <div class="tool" role="group" aria-label="Importance">
        <span class="tool-label">Show</span>
        ${IMPS.map(i => `<button type="button" class="pill" data-imp="${i}" aria-pressed="${f.imp.includes(i)}">${esc(enumLabel(i))} <span class="muted">${data.imp_counts?.[i] ?? 0}</span></button>`).join('')}
      </div>
      <div class="tool" role="group" aria-label="Sort">
        <span class="tool-label">Sort</span>
        <span class="segmented">${SORTS.map(([s, label]) => `<button type="button" data-sort="${s}" aria-pressed="${f.sort === s}">${label}</button>`).join('')}</span>
      </div>
      <div class="tool" role="group" aria-label="View">
        <span class="segmented">${['list', 'cards'].map(v => `<button type="button" data-view="${v}" aria-pressed="${f.view === v}">${enumLabel(v)}</button>`).join('')}</span>
      </div>
      <span class="showing" role="status">Showing ${data.total} of ${data.all}</span>
    </div>`;

  return {
    title: sectionTitle(key),
    html: `<div class="section-page">
      <div class="section-head">
        <div>
          <h1 tabindex="-1">${esc(sectionTitle(key))}</h1>
          <p class="subtitle">${c.total} known through chapter ${store.ch}${c.new ? ` · <span class="new-text">${c.new} new this chapter</span>` : ''}</p>
        </div>
        <label class="name-filter"><span class="sr-only">Filter ${esc(sectionTitle(key).toLowerCase())} by name</span>
          <input type="search" id="name-filter" placeholder="Filter by name" value="${esc(f.q)}" autocomplete="off"></label>
      </div>
      <div id="section-toolbar">${toolbar()}</div>
      <div id="section-results">${results()}</div>
      <p class="muted">${link('#/since', 'What changed since you last read')}</p>
    </div>`,
    mount(root) {
      const page = $('.section-page', root);
      const refresh = async () => {
        // the toolbar is re-rendered: keep keyboard focus on the same control
        const active = document.activeElement;
        const keep = ['imp', 'sort', 'view'].map(k => active?.dataset?.[k] ? `[data-${k}="${active.dataset[k]}"]` : null).find(Boolean);
        saveFilters(key, f);
        data = await fetchData();
        rows = data.rows;
        $('#section-toolbar', page).innerHTML = toolbar();
        $('#section-results', page).innerHTML = results();
        if (keep) $(keep, page)?.focus();
      };
      let timer;
      $('#name-filter', page).addEventListener('input', (ev) => {
        clearTimeout(timer);
        timer = setTimeout(() => { f.q = ev.target.value.trim(); refresh(); }, 250);
      });
      page.addEventListener('click', async (ev) => {
        const t = ev.target;
        const imp = t.closest('[data-imp]');
        if (imp) {
          const i = imp.dataset.imp;
          const next = f.imp.includes(i) ? f.imp.filter(x => x !== i) : [...f.imp, i];
          if (!next.length) return; // keep at least one
          f.imp = IMPS.filter(x => next.includes(x));
          return refresh();
        }
        const sort = t.closest('[data-sort]');
        if (sort) { f.sort = sort.dataset.sort; return refresh(); }
        const view = t.closest('[data-view]');
        if (view) { f.view = view.dataset.view; return refresh(); }
        const more = t.closest('#rows-more');
        if (more) {
          more.disabled = true;
          const page2 = await api(url(key, f, `&limit=${PAGE}&offset=${rows.length}`));
          rows = rows.concat(page2.rows);
          $('#section-results', page).innerHTML = tableHtml(key, data, rows);
        }
      });
    },
  };
}

