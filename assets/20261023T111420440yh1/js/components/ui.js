// HTML building blocks shared by the views. Every function returns a string; values are escaped.
import { esc, enumLabel } from '../util.js';
import { store, sectionTitle, fieldLabel } from '../store.js';

export function chip(ch, cls = '') {
  const c = ch === store.ch ? 'current' : cls;
  return `<span class="chip ${c}" title="From chapter ${ch}">ch ${ch}</span>`;
}

export function metaChips(meta, { skip = [] } = {}) {
  const out = [];
  for (const [k, cls] of [['role', 'role'], ['kind', 'kind'], ['status', 'status'], ['importance', 'imp']]) {
    if (!meta?.[k] || skip.includes(k)) continue;
    if (k === 'status' && meta[k] === 'not_applicable') continue;
    out.push(`<span class="chip ${cls} ${cls}-${esc(meta[k])}">${esc(enumLabel(meta[k]))}</span>`);
  }
  return out.join(' ');
}

// Internal link that keeps the reading chapter in the hash.
export function link(hash, label, cls = '', { current = false } = {}) {
  return `<a class="${cls}" href="${hash}${hash.includes('?') ? '&' : '?'}ch=${store.ch}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
}

export const entityLink = (section, id, label) => link(`#/e/${section}/${encodeURIComponent(id)}`, esc(label));

export const notFoundHtml = () => ({ title: 'Not found', html: '<h1 tabindex="-1">Not found</h1>' });

export const HIDDEN_FIELDS = new Set(['name', 'true_name', 'title', 'kind', 'role', 'status', 'importance', 'headline', 'parent', 'base', 'related', 'affiliations', 'pathway', 'sequence_number', 'when']);
export const ORIGIN_FIELDS = ['origin_zhou_mingrui', 'origin_klein_moretti'];

export function factsList(facts, sec, { highlightCh, skip = HIDDEN_FIELDS } = {}) {
  const out = [];
  for (const [field, list] of Object.entries(facts)) {
    if (skip.has(field) || ORIGIN_FIELDS.includes(field)) continue;
    // a removal is shown on the fact it ends ("until ch X"), or on its own when that fact is not listed
    const items = list.filter(f => f.op !== 'remove' || !list.some(a => a.op !== 'remove' && a.value === f.value));
    out.push(`<dt>${esc(fieldLabel(sec, field))}</dt><dd><ul>${items.map(f =>
      `<li class="${f.ch === highlightCh ? 'current-ch' : ''}${f.until != null || f.op === 'remove' ? ' ended' : ''}">${f.op === 'remove' ? 'No longer: ' : ''}${esc(f.value)} ${chip(f.ch)}${f.until != null ? ` <span class="muted">until ch ${f.until}</span>` : ''}</li>`).join('')}</ul></dd>`);
  }
  return out.length ? `<dl class="facts">${out.join('')}</dl>` : '<p class="empty">Nothing recorded yet.</p>';
}

export function originBlocks(facts, sec, highlightCh) {
  const blocks = ORIGIN_FIELDS.filter(f => facts[f]?.length).map(f => `
    <div class="origin-card">
      <h2 class="origin-title">${esc(fieldLabel(sec, f))}</h2>
      <ul>${facts[f].map(x => `<li class="${x.ch === highlightCh ? 'current-ch' : ''}">${esc(x.value)} ${chip(x.ch)}</li>`).join('')}</ul>
    </div>`);
  return blocks.length ? `<div class="origins">${blocks.join('')}</div>` : '';
}

// former names + aliases, without repeating the heading or each other
export function akaOf(e) {
  const seen = new Set([e.name, e.heading]);
  return [...(e.former_names ?? []), ...(e.facts?.aliases?.map(a => a.value) ?? e.aliases ?? [])].filter(x => !seen.has(x) && seen.add(x));
}

// A card from either a full entity (/api/chapter, /api/entity) or a slim row (/api/section).
export function cardData(e) {
  if (e.facts) {
    const preview = Object.entries(e.facts).filter(([k]) => !HIDDEN_FIELDS.has(k) && k !== 'aliases').flatMap(([, l]) => l).map(f => f.value).slice(0, 2).join(' · ');
    return { id: e.id, heading: e.heading, meta: e.meta, first_ch: e.first_ch, isNew: e.isNew, aka: akaOf(e), preview };
  }
  return { id: e.id, heading: e.heading, meta: e.meta, first_ch: e.first_ch, isNew: e.isNew, aka: [], preview: e.preview?.value ?? '' };
}

export function entityCard(sec, e, { markNew = false } = {}) {
  const c = cardData(e);
  return `<a class="card ${c.meta?.importance ? 'imp-' + esc(c.meta.importance) : ''}" href="#/e/${sec.key}/${encodeURIComponent(c.id)}?ch=${store.ch}">
    <div class="title">${esc(c.heading)} ${markNew && c.isNew ? '<span class="chip new">new</span>' : chip(c.first_ch)}</div>
    <div class="metaline">${c.meta?.when ? `<span class="chip when">${esc(c.meta.when)}</span>` : ''}${metaChips(c.meta, { skip: ['role'] })}</div>
    ${c.aka.length ? `<div class="muted aka">${esc(c.aka.join(', '))}</div>` : ''}
    <div class="preview">${esc(c.preview)}</div></a>`;
}

// total entries in a group and its sub-groups
export function groupSize(g) {
  return g.entries.length + (g.children ?? []).reduce((a, c) => a + groupSize(c), 0);
}

// groups: [{key, title, entries: [entity|row], children}]
//   opts.level: heading level of the top groups (default 2; nested groups go one level down, max 6)
export function groupedCards(sec, groups, opts = {}, depth = 0) {
  if (!groups?.length) return depth ? '' : '<p class="empty">Nothing recorded yet.</p>';
  const h = Math.min(6, (opts.level ?? 2) + depth);
  return groups.map(g => `
    ${g.title ? `<h${h} class="group-title depth-${depth}">${esc(g.title)} <span class="chip">${groupSize(g)}</span></h${h}>` : ''}
    ${g.entries.length ? `<div class="cards depth-${depth}">${g.entries.map(e => entityCard(sec, e, opts)).join('')}</div>` : ''}
    ${groupedCards(sec, g.children ?? [], opts, depth + 1)}`).join('');
}

export function locationTreeHtml(entries) {
  if (!entries.length) return '<p class="empty">Nothing recorded yet.</p>';
  return `<ul class="loc-tree">${entries.map(e => `
    <li style="--depth:${e.depth ?? 0}">
      ${entityLink('locations', e.id, e.heading)}
      ${metaChips(e.meta)} ${chip(e.first_ch)}
    </li>`).join('')}</ul>`;
}

export const notesList = (list, empty) => list.length
  ? `<ul class="notes">${list.map(f => `<li>${esc(f.value)} ${chip(f.ch)}</li>`).join('')}</ul>`
  : `<p class="empty">${esc(empty)}</p>`;

export { sectionTitle, fieldLabel };

// One dated diary entry (PLAN D1), word for word: its paragraphs, the opening date in bold.
export function diaryEntryHtml(e) {
  const head = `“${e.year ? `${e.year}, ` : ''}${e.date}.`;
  // a site exported with --no-diary-text has the dates only
  if (!e.text) return `<article class="diary-entry"><p><strong class="diary-date">${esc(head.slice(1, -1))}</strong></p></article>`;
  const [first, ...rest] = String(e.text).split('\n');
  const lead = first.startsWith(head)
    ? `<strong class="diary-date">${esc(head)}</strong>${esc(first.slice(head.length))}`
    : esc(first);
  return `<article class="diary-entry"><p>${lead}</p>${rest.map(p => `<p>${esc(p)}</p>`).join('')}</article>`;
}
