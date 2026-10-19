// #/e/<section>/<id> — one entity through the reading chapter, in layers (mockup 02):
// header, "Since you last read" recap, tabs Overview | All facts | Chapter by chapter, and the
// "At chapter N" infobox. Everything comes from /api/entity/…?view=overview plus the paged
// /facts and /chapter/:c endpoints. The open tab, field and range live in the hash (tab=, open=,
// range=) so they survive a reload.
import { $, $$, esc, enumLabel, storage, chapterTitle } from '../util.js';
import { api } from '../api.js';
import { store, sectionOf, sectionTitle, fieldLabel } from '../store.js';
import { chip, link, entityLink, notFoundHtml, diaryEntryHtml } from '../components/ui.js';
import { tabsHtml, initTabs } from '../components/tabs.js';
import { replaceQuery } from '../router.js';
import { volumeLabel } from '../components/picker.js';
import { REPORTS } from '../mode.js';
import { reportCounts } from '../components/reports.js';

const TABS = ['overview', 'entries', 'facts', 'timeline'];
const ORIGIN_FIELDS = ['origin_zhou_mingrui', 'origin_klein_moretti'];
const RECENT_FIRST = 5;
const FACTS_FIRST = 5;
const FACTS_PAGE = 25;
const TIMELINE_FIRST = 10;
const TIMELINE_PAGE = 50;
const RANGE_STEP = 50;
// "Right now" prefers fields updated in the last FRESH chapters; older ones go last, marked "as of ch X".
const FRESH = 50;
// "Right now" cards: the first four of these fields the entity has
const RIGHT_NOW = {
  characters: ['current_condition', 'skills_knowledge', 'possessions', 'relationships_affiliations', 'physical_description', 'history'],
  organizations: ['members', 'description', 'type', 'history', 'notes'],
  locations: ['description', 'notable_features', 'inhabitants_affiliations', 'events_here', 'history'],
  items_artifacts: ['description', 'abilities_effects', 'ownership_custody', 'appearance', 'history'],
  pathways_sequences: ['abilities', 'potion_formula', 'ingredients', 'known_beyonders', 'characteristics', 'description'],
  rituals_abilities: ['purpose', 'effects', 'procedure', 'requirements_materials', 'practitioners', 'description'],
  creatures_entities: ['description', 'abilities', 'type', 'notes'],
  terminology: ['definition', 'usage_context', 'category', 'notes'],
  world_lore: ['details', 'implications', 'category', 'notes'],
  timeline_dates: ['event', 'date', 'significance', 'notes'],
};
const RECAP_LABEL = { status: 'Status', sequence_number: 'Sequence', title: 'Title', true_name: 'True name', name: 'Name', role: 'Role' };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const chCell = (ch) => `<span class="ch-chip${ch === store.ch ? ' current' : ''}">ch ${ch}</span>`;
const sectionLabel = (key) => enumLabel(String(sectionOf(key)?.label ?? key).toLowerCase().split(' /')[0]);

// A fact's value as HTML: a link when it is a reference (the API resolves it for this chapter).
const factValue = (f) => (f.ref ? entityLink(f.ref.section, f.ref.id, f.ref.heading) : esc(f.value));

function factItem(f) {
  const ended = f.until != null || f.op === 'remove';
  return `<li class="${ended ? 'ended' : ''}">${f.op === 'remove' ? 'No longer: ' : ''}${factValue(f)} ${chCell(f.ch)}${f.until != null ? ` <span class="muted">until ch ${f.until}</span>` : ''}</li>`;
}

// ---- header, recap, infobox ------------------------------------------------------------------

// Header (design 1a): a case-file kicker (section › parent · role · kind), the name, a line of
// titles, and the three numbers on the right.
function headerHtml(o, sec) {
  const sub = [o.meta.title && o.meta.title !== o.name ? esc(o.meta.title) : null,
    o.meta.true_name && o.meta.true_name !== o.name ? `true name ${esc(o.meta.true_name)}` : null,
    o.meta.when ? esc(o.meta.when) : null].filter(Boolean);
  const kicker = [link(`#/s/${sec.key}`, esc(sectionTitle(sec.key)))];
  if (o.infobox.parent) kicker.push(`<span aria-hidden="true">›</span> ${entityLink(o.infobox.parent.section, o.infobox.parent.id, o.infobox.parent.heading)}`);
  const tags = [o.meta.role, o.meta.kind].filter(Boolean).map(v => `<span class="kicker-tag${v === 'protagonist' ? ' hot' : ''}">${esc(enumLabel(v))}</span>`);
  if (o.meta.status === 'dead') tags.push('<span class="kicker-tag dead">Dead</span>');
  const stat = (big, label) => `<div><dd>${big}</dd><dt>${label}</dt></div>`;
  return `<header class="ent-head">
    <div class="ent-id">
      <nav class="crumbs kicker" aria-label="Breadcrumb">${kicker.join(' ')}${tags.length ? ` <span class="kicker-sep" aria-hidden="true">·</span> ${tags.join(' <span class="kicker-sep" aria-hidden="true">·</span> ')}` : ''}</nav>
      <h1 class="ent-name" tabindex="-1">${esc(o.name)}</h1>
      ${sub.length ? `<p class="ent-sub">${sub.join(' · ')}</p>` : ''}
    </div>
    <dl class="ent-stats">
      ${stat(`ch ${o.first_ch}`, 'first appears')}
      ${stat(o.chapters_total.toLocaleString('en-US'), o.chapters_total === 1 ? 'chapter present' : 'chapters present')}
      ${stat(o.facts_total.toLocaleString('en-US'), 'facts recorded')}
    </dl>
  </header>`;
}

// Presence (design 1b): one bar per chapter through the reading one, its height the facts the
// chapter recorded; volumes alternate in tone, chapters since the last read are green, the reading
// chapter is marked. Clicking a bar opens that chapter in "Chapter by chapter".
function presenceHtml(o) {
  const n = store.ch;
  if (!o.presence?.length || n < 2) return '';
  const by = new Map(o.presence.map(p => [p.ch, p.facts]));
  const max = Math.max(1, ...o.presence.map(p => p.facts));
  const volOf = new Map(store.chapters.map(c => [c.n, c.volume]));
  const starts = store.chapters.filter((c, i, a) => c.n <= n && c.volume && (i === 0 || a[i - 1].volume !== c.volume));
  const fresh = o.since?.from ?? null;
  let bars = '';
  for (let c = 1; c <= n; c++) {
    if (!by.has(c)) { bars += '<span></span>'; continue; }
    const f = by.get(c);
    const vi = starts.findIndex(s => s.volume === volOf.get(c));
    const cls = c === n ? 'now' : fresh != null && c > fresh ? 'fresh' : vi % 2 ? 'odd' : 'even';
    bars += `<span class="pb ${cls}" style="--h:${f ? Math.max(8, Math.round(100 * Math.sqrt(f / max))) : 3}%" data-ch="${c}" title="ch ${c} · ${plural(f, 'fact')}"></span>`;
  }
  const marks = starts.map(s => `<span class="pmark" style="--x:${(s.n - 1) / n * 100}%">ch ${s.n} · Vol ${esc(volumeLabel(s.volume))}</span>`).join('');
  return `<section class="presence" aria-label="Presence">
    <div class="presence-head"><span>Presence · facts per chapter · click to open a chapter</span><span class="presence-now">viewing ch ${n}</span></div>
    <div class="presence-bars" style="--n:${n}" aria-hidden="true">${bars}</div>
    <div class="presence-scale">${marks}<span class="pmark end">ch ${n}</span></div>
    <p class="sr-only">Present in ${plural(o.chapters_total, 'chapter')} from ch ${o.first_ch} to ch ${o.last_ch}.</p>
  </section>`;
}

const recapKey = (o) => `wiki.recap.${o.section}:${o.id}:${o.since.from}-${store.ch}`;

// "Since you last read" (design 1a): one "+ ch" row per change, newest first, above the tabs.
function recapHtml(o) {
  const s = o.since;
  if (!s || !s.facts || storage.get(recapKey(o))) return '';
  const rows = [];
  if (s.is_new) rows.push([o.first_ch, 'First appears']);
  for (const c of s.changes) rows.push([c.ch, `${RECAP_LABEL[c.field] ?? c.field}: ${['status', 'role'].includes(c.field) ? enumLabel(c.value) : c.value}`]);
  for (const r of s.joined) rows.push([r.ch ?? store.ch, `Joined ${r.heading}`]);
  for (const r of s.left) rows.push([r.ch ?? store.ch, `Left ${r.heading}`]);
  for (const h of s.headlines) rows.push([h.ch, h.value]);
  rows.sort((a, b) => b[0] - a[0]);
  const shown = rows.slice(0, 3);
  return `<section class="recap" role="region" aria-label="Since you last read">
    <div class="recap-head"><span class="recap-kicker">Since you last read · ch ${s.from} → ${store.ch}</span>
      <button type="button" class="recap-all" id="recap-all">See all ${plural(s.facts, 'change')} →</button>
      <button type="button" class="recap-close" id="recap-close" aria-label="Dismiss">×</button></div>
    ${shown.length ? `<ul class="recap-rows">${shown.map(([ch, text]) => `<li><span class="recap-ch">+ ${ch}</span><span>${esc(text)}</span></li>`).join('')}</ul>`
      : `<p class="recap-text">${plural(s.facts, 'new fact')} in ${plural(s.chapters, 'chapter')}</p>`}
    ${rows.length > shown.length ? `<p class="recap-more">and ${rows.length - shown.length} more</p>` : ''}
  </section>`;
}

// Dossier (design 1a): the entity as of the reading chapter.
function infoboxHtml(o, sec) {
  const rows = [];
  const add = (label, html) => { if (html) rows.push(`<dt>${esc(label)}</dt><dd>${html}</dd>`); };
  const withCh = (value, field) => `${esc(value)}${o.meta_ch?.[field] ? ` <span class="dossier-ch">ch ${o.meta_ch[field]}</span>` : ''}`;
  if (o.meta.status && o.meta.status !== 'not_applicable') add('Status', withCh(enumLabel(o.meta.status), 'status'));
  else if (o.meta.kind) add('Kind', esc(enumLabel(o.meta.kind)));
  if (o.meta.importance && sec.key !== 'characters') add('Importance', esc(enumLabel(o.meta.importance)));
  if (o.entries_total) add('Entries', `${o.entries_total} dated ${o.entries_total === 1 ? 'page' : 'pages'}`);
  if (o.infobox.pathway) add('Pathway', entityLink(o.infobox.pathway.section, o.infobox.pathway.id, o.infobox.pathway.heading));
  if (o.meta.sequence_number != null) add('Sequence', withCh(o.meta.sequence_number, 'sequence_number'));
  if (o.meta.title && sec.key !== 'pathways_sequences') add('Title', withCh(o.meta.title, 'title'));
  if (o.infobox.parent) add('Part of', entityLink(o.infobox.parent.section, o.infobox.parent.id, o.infobox.parent.heading));
  if (o.infobox.base) add('Based in', entityLink(o.infobox.base.section, o.infobox.base.id, o.infobox.base.heading));
  const aff = o.infobox.affiliations ?? [];
  if (aff.length) {
    const more = aff.length > 4 ? `<details class="more"><summary>+${aff.length - 4} more</summary>${aff.slice(4).map(r => entityLink(r.section, r.id, r.heading)).join('')}</details>` : '';
    add('Member of', `<span class="stack">${aff.slice(0, 4).map(r => entityLink(r.section, r.id, r.heading)).join('')}${more}</span>`);
  }
  const former = o.infobox.former_affiliations ?? [];
  if (former.length) add('Formerly in', `<span class="stack">${former.slice(0, 3).map(r => `${entityLink(r.section, r.id, r.heading)} <span class="muted">until ch ${r.until}</span>`).join('')}</span>`);
  const seen = new Set([o.name]);
  const aka = [...o.former_names, ...o.aliases].filter(x => !seen.has(x) && seen.add(x));
  const origins = (o.fields ?? []).filter(f => ORIGIN_FIELDS.includes(f.key));
  const where = `${sectionTitle(sec.key)} › ${o.heading}`;
  return `<aside class="infobox dossier" id="infobox" aria-labelledby="infobox-title">
    <div class="dossier-head"><h2 id="infobox-title">Dossier</h2><span class="asof">as of ch ${store.ch}</span></div>
    ${rows.length ? `<dl class="info-list">${rows.join('')}</dl>` : ''}
    ${aka.length ? `<div class="dossier-part"><h3>Known as</h3><ul class="aka-list">${aka.slice(0, 3).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      ${aka.length > 3 ? `<a href="#" data-open-field="aliases" class="dossier-more">+${aka.length - 3} ${aka.length - 3 === 1 ? 'name' : 'names'}</a>` : ''}</div>` : ''}
    ${origins.length ? `<div class="dossier-part info-origins"><h3>Origins</h3>${origins.map(f => `<a href="#" data-open-field="origins">${esc(fieldLabel(sec, f.key).replace(/^Origin — /, ''))} · ${plural(f.count, 'fact')}</a>`).join('')}</div>` : ''}
    ${!REPORTS ? '' : `<div class="dossier-part">${link(`#/report?from=${encodeURIComponent(where)}`, 'Report an error on this page', 'muted')}</div>`}
  </aside>`;
}

// Phones (design 2a): the four key values as a 2×2 ledger, and a toggle for the whole dossier.
function infoChips(o, sec) {
  const cells = [];
  const add = (label, value) => { if (value != null && value !== '') cells.push(`<div class="key-cell"><span class="key-label">${esc(label)}</span><span class="key-value">${esc(value)}</span></div>`); };
  if (o.meta.status && o.meta.status !== 'not_applicable') add('Status', enumLabel(o.meta.status));
  if (o.meta.sequence_number != null) add('Sequence', o.meta.sequence_number);
  else if (o.meta.kind) add('Kind', enumLabel(o.meta.kind));
  const aff = o.infobox.affiliations ?? [];
  if (aff.length) add('Member of', aff[0].heading + (aff.length > 1 ? ` +${aff.length - 1}` : ''));
  else if (o.meta.title && sec.key !== 'pathways_sequences') add('Title', o.meta.title);
  add('First seen', `ch ${o.first_ch}`);
  return `<div class="phone-info">
    <div class="key-facts">${cells.slice(0, 4).join('')}</div>
    <button type="button" class="details-toggle" aria-expanded="false" aria-controls="infobox">Dossier <span aria-hidden="true">▾</span></button>
  </div>`;
}

// ---- Overview tab ------------------------------------------------------------------------------

function overviewPanel(o, sec) {
  const parts = [];
  if (o.summary?.text) {
    const paras = o.summary.text.split(/\n\s*\n/).filter(p => p.trim());
    const more = paras.length - 1;
    parts.push(`<section class="block block-story"><div class="block-head"><h2>The story so far</h2><span class="block-note">through ch ${o.summary.through_ch} · written by Claude</span></div>
      <div class="prose clamp${more ? ' has-more' : ''}" id="story-text">${paras.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      <button type="button" class="read-more${more ? ' has-more' : ''}" aria-expanded="false" aria-controls="story-text" data-more="${more}">${more ? `Continue reading · ${plural(more, 'more paragraph')}` : 'Read more'}</button></section>`);
  }
  const recent = o.recent.items.filter(r => r.text);
  if (recent.length) {
    const title = o.recent.from > 0 ? `Since ch ${o.recent.from}` : 'Chapter by chapter';
    const row = (r, hidden) => `<li class="since-row"${hidden ? ' hidden' : ''}>${chCell(r.ch)}<div><span class="since-title">${esc(chapterTitle(r.title))}</span><span>${esc(r.text)}</span></div></li>`;
    const rest = recent.slice(RECENT_FIRST);
    parts.push(`<section class="block block-since"><div class="block-head"><h2>${title}</h2><span class="block-note">one line per chapter · newest first</span></div>
      <ol class="since-list">${recent.map((r, i) => row(r, i >= RECENT_FIRST)).join('')}</ol>
      ${rest.length ? `<button type="button" class="btn btn-outline" data-reveal="since-row">Show ch ${rest.at(-1).ch}–${rest[0].ch}</button>` : ''}</section>`);
  }
  const byKey = new Map(o.fields.map(f => [f.key, f]));
  const candidates = (RIGHT_NOW[sec.key] ?? []).map(k => byKey.get(k)).filter(f => f?.latest.length);
  const isFresh = (f) => store.ch - f.latest[0].ch < FRESH;
  const cards = [...candidates.filter(isFresh), ...candidates.filter(f => !isFresh(f))].slice(0, 4);
  if (cards.length) {
    // "Current state" (design 1a): a ledger, one row per field — label, the newest value, its chapter
    parts.push(`<section class="block block-now"><h2>Current state</h2><div class="state-ledger">${cards.map(f => {
      const first = f.latest[0];
      const value = f.key === 'current_condition' ? f.latest.map(x => esc(x.value)).join(' ') : factValue(first);
      const earlier = f.count - (f.key === 'current_condition' ? f.latest.length : 1);
      const stale = !isFresh(f);
      return `<div class="state-row${stale ? ' stale' : ''}"><span class="state-label">${esc(fieldLabel(sec, f.key))}</span>
        <span class="state-value">${value}${earlier > 0 ? ` <a href="#" class="state-more" data-open-field="${f.key}" title="${earlier} earlier">+${earlier}</a>` : ''}</span>
        ${stale ? `<span class="as-of">as of ch ${first.ch}</span>` : `<span class="state-ch">${chCell(first.ch)}</span>`}</div>`;
    }).join('')}</div></section>`);
  }
  if (o.connections.items.length) {
    const all = [...o.related.items, ...o.backlinks.items].filter((r, i, a) => a.findIndex(x => x.section === r.section && x.id === r.id) === i);
    const extra = all.filter(r => !o.connections.items.some(c => c.section === r.section && c.id === r.id));
    parts.push(`<section class="block block-links"><h2>Most connected</h2><div class="links">${o.connections.items.map(c =>
      `<span class="linkchip" title="${esc(c.heading)} · together in ${plural(c.count, 'chapter')}">${entityLink(c.section, c.id, c.name ?? c.heading)} <span class="muted">${esc(sectionLabel(c.section))}</span></span>`).join('')}
      ${extra.length ? `<details class="more-links"><summary>Other links (${extra.length})</summary><div class="links">${extra.map(c =>
        `<span class="linkchip">${entityLink(c.section, c.id, c.heading)} <span class="muted">${esc(sectionLabel(c.section))}</span></span>`).join('')}</div></details>` : ''}</div></section>`);
  }
  if (!parts.length) {
    // a small entity: its facts are the overview
    parts.push(`<section class="block"><h2>What is known</h2>${o.fields.length ? `<dl class="facts">${o.fields.map(f =>
      `<dt>${esc(fieldLabel(sec, f.key))}</dt><dd><ul>${f.latest.map(factItem).join('')}</ul></dd>`).join('')}</dl>` : '<p class="empty">Nothing recorded yet.</p>'}</section>`);
  }
  return `<div class="ov-blocks">${parts.join('')}</div>`;
}

// ---- All facts tab -----------------------------------------------------------------------------

function ranges(n) {
  const out = [{ key: '', label: 'All' }];
  for (let a = 1; a <= n; a += RANGE_STEP) {
    const b = Math.min(n, a + RANGE_STEP - 1);
    out.push({ key: `${a}-${b}`, label: a === b ? `${a}` : `${a}–${b}` });
  }
  return out.length > 2 ? out : out.slice(0, 1);
}

function factCards(o, sec) {
  const cards = o.fields.filter(f => !ORIGIN_FIELDS.includes(f.key)).map(f => ({ key: f.key, label: fieldLabel(sec, f.key), count: f.count, fields: [f.key] }));
  const origins = o.fields.filter(f => ORIGIN_FIELDS.includes(f.key));
  if (origins.length) cards.push({ key: 'origins', label: 'Origins', count: origins.reduce((a, f) => a + f.count, 0), fields: origins.map(f => f.key) });
  return cards;
}

function factsPanel(o, sec, { open, range }) {
  const cards = factCards(o, sec);
  const rs = ranges(store.ch);
  return `${rs.length > 1 ? `<div class="range-chips" role="group" aria-label="Chapters">${rs.map(r =>
      `<button type="button" class="range-chip" data-range="${r.key}" aria-pressed="${r.key === range}">${esc(r.label)}</button>`).join('')}</div>` : ''}
    ${cards.map(c => `<div class="field-card" data-card="${c.key}">
      <button type="button" class="field-toggle" aria-expanded="${c.key === open}" aria-controls="card-${c.key}">
        <span class="field-name">${esc(c.label)}</span><span class="count-pill">${c.count}</span><span class="field-action">${c.key === open ? 'Collapse' : 'Show latest'}</span>
      </button>
      <div class="field-body" id="card-${c.key}"${c.key === open ? '' : ' hidden'}></div>
    </div>`).join('') || '<p class="empty">Nothing recorded yet.</p>'}`;
}

// Load (the next page of) one card's facts into its body.
async function loadCard(o, sec, card, body, range, { more = false } = {}) {
  const [from, to] = range ? range.split('-').map(Number) : [1, store.ch];
  body.dataset.offset ??= '0';
  const offset = more ? Number(body.dataset.offset) : 0;
  const limit = more ? FACTS_PAGE : FACTS_FIRST;
  const pages = await Promise.all(card.fields.map(field =>
    api(`/api/entity/${o.section}/${encodeURIComponent(o.id)}/facts?ch=${store.ch}&field=${field}&from=${from}&to=${to}&offset=${offset}&limit=${limit}`)));
  body.querySelector('.show-more')?.remove();
  if (more) {
    const lists = body.querySelectorAll('.fact-list');
    pages.forEach((pg, i) => lists[i]?.insertAdjacentHTML('beforeend', pg.facts.map(factItem).join('')));
  } else {
    body.innerHTML = pages.map(pg => `${card.fields.length > 1 ? `<p class="sub">${esc(fieldLabel(sec, pg.field))}</p>` : ''}<ul class="fact-list">${pg.facts.map(factItem).join('')}</ul>`).join('');
  }
  const shown = offset + limit;
  body.dataset.offset = String(shown);
  const left = Math.max(0, ...pages.map(p => p.total - shown));
  if (!pages.some(p => p.total)) body.innerHTML = `<p class="empty">Nothing in ${range ? `chapters ${esc(range.replace('-', '–'))}` : 'this field'}.</p>`;
  else if (left > 0) body.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-outline show-more">Show ${Math.min(left, FACTS_PAGE)} more <span class="muted">(${left} left)</span></button>`);
}

// ---- Chapter by chapter tab --------------------------------------------------------------------

// The tab's rows come from /api/entity/…/chapters, newest first, TIMELINE_PAGE at a time (PLAN B2.1:
// the overview no longer carries the whole list). Load until `visible` rows are there.
async function ensureTimeline(o, state) {
  const t = state.timeline ??= { items: [], total: o.chapters_total };
  while (t.items.length < Math.min(t.total, state.visible)) {
    const page = await api(`/api/entity/${o.section}/${encodeURIComponent(o.id)}/chapters?ch=${store.ch}&offset=${t.items.length}&limit=${TIMELINE_PAGE}`);
    t.total = page.total;
    t.items.push(...page.items);
    if (!page.items.length) break;
  }
  return t;
}

function timelinePanel(o, { openChapters, visible, timeline }) {
  const volumeOf = new Map(store.chapters.map(c => [c.n, c.volume]));
  const rows = timeline.items;
  let html = '', currentVolume;
  rows.forEach((c, i) => {
    const vol = volumeOf.get(c.ch) ?? 'Earlier';
    if (vol !== currentVolume) { html += `<h2 class="vol-head"${i >= visible ? ' hidden' : ''} data-row="${i}">${esc(vol)}</h2>`; currentVolume = vol; }
    const open = openChapters.has(c.ch);
    html += `<div class="ch-row" data-row="${i}"${i >= visible ? ' hidden' : ''}>
      <button type="button" class="ch-toggle" data-ch="${c.ch}" aria-expanded="${open}" aria-controls="ch-body-${c.ch}">
        <span class="ch-num">ch ${c.ch}</span><span class="ch-title">${esc(chapterTitle(c.title))}</span><span class="muted">${plural(c.count, 'fact')}</span><span class="chev" aria-hidden="true">${open ? '−' : '+'}</span>
      </button>
      <div class="ch-body" id="ch-body-${c.ch}"${open ? '' : ' hidden'}></div>
    </div>`;
  });
  const left = timeline.total - visible;
  return `<p class="muted">Newest first · open a chapter to read its facts</p>${html}
    ${left > 0 ? `<button type="button" class="btn btn-outline" id="timeline-more">Show ${Math.min(left, TIMELINE_PAGE)} earlier chapters</button>` : ''}`;
}

async function loadChapter(o, sec, c, body) {
  if (body.dataset.loaded) return;
  const d = await api(`/api/entity/${o.section}/${encodeURIComponent(o.id)}/chapter/${c}?ch=${store.ch}`);
  const skip = new Set(['name', 'kind', 'importance', 'related', 'affiliations']);
  const items = Object.entries(d.facts).filter(([f]) => !skip.has(f) || c === o.first_ch).flatMap(([f, list]) =>
    list.map(x => `<li><span class="field">${esc(fieldLabel(sec, f))}:</span> ${x.op === 'remove' ? 'No longer: ' : ''}${factValue(x)}</li>`));
  body.innerHTML = items.length ? `<ul class="fact-list">${items.join('')}</ul>`
    : `<p class="empty">${d.mentioned ? 'Named in this chapter, with nothing new.' : 'Only links and identity details.'}</p>`;
  body.dataset.loaded = '1';
}

// ---- Entries tab (diaries, PLAN D1) ------------------------------------------------------------

// Every dated entry read through the reading chapter, oldest first, grouped by the chapter where
// the reader reads them. A diary has a few dozen at most, so they load in pages of 200 until done.
async function loadEntries(o, state) {
  if (state.entries) return state.entries;
  const items = [];
  for (;;) {
    const page = await api(`/api/entity/${o.section}/${encodeURIComponent(o.id)}/entries?ch=${store.ch}&offset=${items.length}&limit=200`);
    items.push(...page.items);
    if (!page.items.length || items.length >= page.total) break;
  }
  return (state.entries = items);
}

function entriesPanel(items) {
  if (!items.length) return '<p class="empty">No dated entries read yet.</p>';
  let html = '', ch = null;
  for (const e of items) {
    if (e.ch !== ch) {
      if (ch != null) html += '</section>';
      ch = e.ch;
      html += `<section class="diary-group"><h2 class="diary-read">Read in ch ${e.ch}<span class="muted"> · ${esc(chapterTitle(e.title))}</span></h2>`;
    }
    html += diaryEntryHtml(e);
  }
  return `<p class="muted">Word for word, in the order the pages are read</p><div class="diary">${html}</section></div>`;
}

// ---- the view ----------------------------------------------------------------------------------

export async function entity(key, id, params) {
  const sec = sectionOf(key);
  if (!sec) return notFoundHtml();
  const n = store.ch;
  const since = store.lastRead != null && store.lastRead < n ? store.lastRead : null;
  let o;
  try {
    o = await api(`/api/entity/${key}/${encodeURIComponent(id)}?ch=${n}&view=overview${since != null ? `&since=${since}` : ''}`);
  } catch (err) {
    if (err.status !== 404) throw err;
    // no hint about when it appears: that would itself be a spoiler
    return { title: 'Not known yet', html: `<h1 tabindex="-1">Not known yet</h1><p class="empty">Not known yet at chapter ${n}.</p>` };
  }
  const hasEntries = o.entries_total > 0;
  const asked = params.get('tab');
  const tab = TABS.includes(asked) && (asked !== 'entries' || hasEntries) ? asked : 'overview';
  const cards = factCards(o, sec);
  const defaultOpen = (cards.find(c => c.key === 'bio') ?? [...cards].sort((a, b) => b.count - a.count)[0])?.key ?? null;
  const state = {
    open: cards.some(c => c.key === params.get('open')) ? params.get('open') : defaultOpen,
    range: ranges(n).some(r => r.key === params.get('range')) ? params.get('range') ?? '' : '',
    openChapters: new Set(o.last_ch ? [o.last_ch] : []),
    visible: TIMELINE_FIRST,
  };

  return {
    title: o.heading,
    html: `<article class="ent">
      ${headerHtml(o, sec)}
      ${infoChips(o, sec)}
      ${presenceHtml(o)}
      <div class="ent-body">
        <div class="ent-main">
          <div id="ent-report-notice"></div>
          ${recapHtml(o)}
          ${tabsHtml('ent-tabs', [
            { key: 'overview', label: 'Overview' },
            ...(hasEntries ? [{ key: 'entries', label: 'Entries', count: o.entries_total }] : []),
            { key: 'facts', label: 'All facts', short: 'Facts', count: o.facts_total.toLocaleString('en-US') },
            { key: 'timeline', label: 'Chapter by chapter', short: 'Timeline', count: o.chapters_total },
          ], tab, 'Entity views')}
        </div>
        ${infoboxHtml(o, sec)}
      </div>
    </article>`,
    mount(root) {
      // readers' reports about this page, from chapters already read (the same "where" the Report link fills in)
      if (REPORTS) {
        const where = `${sectionTitle(sec.key)} › ${o.heading}`;
        reportCounts(store.ch, where).then(({ page }) => {
          const box = $('#ent-report-notice', root);
          if (!page || !box?.isConnected) return;
          box.outerHTML = `<p class="report-notice" role="note"><span class="kicker">Reader reports</span>
            <span>${page === 1 ? 'A reader reported' : `${page} readers reported`} a problem on this page.</span>
            ${link(`#/reports?where=${encodeURIComponent(where)}`, page === 1 ? 'Read it' : 'Read them')}</p>`;
        });
      }
      let current = tab;
      const renderPanel = (key, panel) => {
        current = key;
        replaceQuery({ tab: key === 'overview' ? null : key });
        if (key === 'overview') panel.innerHTML = overviewPanel(o, sec);
        else if (key === 'entries') {
          if (!state.entries) panel.innerHTML = '<p class="muted">Loading entries…</p>';
          loadEntries(o, state).then((items) => { if (current === 'entries') panel.innerHTML = entriesPanel(items); });
        } else if (key === 'facts') {
          panel.innerHTML = factsPanel(o, sec, state);
          const body = state.open && $(`#card-${state.open}`, panel);
          if (body) loadCard(o, sec, cards.find(c => c.key === state.open), body, state.range);
        } else {
          panel.innerHTML = '<p class="muted">Loading chapters…</p>';
          ensureTimeline(o, state).then((t) => {
            if (current !== 'timeline') return;
            if (state.openNewest) { // "See all changes": the newest chapters since the last read one, open
              state.openChapters = new Set(t.items.filter(c => c.ch > o.since.from).slice(0, state.openNewest).map(c => c.ch));
              state.openNewest = 0;
            }
            panel.innerHTML = timelinePanel(o, state);
            for (const c of state.openChapters) { const b = $(`#ch-body-${c}`, panel); if (b && !b.hidden) loadChapter(o, sec, c, b); }
            if (state.scrollTo) { $(`#ch-body-${state.scrollTo}`, panel)?.closest('.ch-row')?.scrollIntoView({ block: 'center' }); state.scrollTo = null; }
          });
        }
      };
      const select = initTabs(root, 'ent-tabs', renderPanel);
      renderPanel(tab, $('#ent-tabs-panel', root));

      const openField = (field) => {
        state.open = field;
        replaceQuery({ open: field });
        if (current === 'facts') renderPanel('facts', $('#ent-tabs-panel', root)); else select('facts');
        $(`[data-card="${field}"]`, root)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };

      // listen on the article: #content outlives this page
      $('.ent', root).addEventListener('click', async (ev) => {
        const t = ev.target;
        const fieldLink = t.closest('[data-open-field]');
        if (fieldLink) { ev.preventDefault(); return openField(fieldLink.dataset.openField); }
        const reveal = t.closest('[data-reveal]');
        if (reveal) { for (const el of $$(`.${reveal.dataset.reveal}[hidden]`, root)) el.hidden = false; reveal.remove(); return; }
        const range = t.closest('[data-range]');
        if (range) {
          state.range = range.dataset.range;
          replaceQuery({ range: state.range || null });
          return renderPanel('facts', $('#ent-tabs-panel', root));
        }
        const toggle = t.closest('.field-toggle');
        if (toggle) {
          const card = toggle.closest('[data-card]').dataset.card;
          const body = $(`#card-${card}`, root);
          const opening = body.hidden;
          body.hidden = !opening;
          toggle.setAttribute('aria-expanded', String(opening));
          toggle.querySelector('.field-action').textContent = opening ? 'Collapse' : 'Show latest';
          if (opening) {
            state.open = card;
            replaceQuery({ open: card });
            body.dataset.offset = '0';
            await loadCard(o, sec, cards.find(c => c.key === card), body, state.range);
          }
          return;
        }
        const more = t.closest('.show-more');
        if (more) {
          const card = more.closest('[data-card]').dataset.card;
          more.disabled = true;
          return loadCard(o, sec, cards.find(c => c.key === card), more.parentElement, state.range, { more: true });
        }
        const chToggle = t.closest('.ch-toggle');
        if (chToggle) {
          const c = Number(chToggle.dataset.ch);
          const body = $(`#ch-body-${c}`, root);
          const opening = body.hidden;
          body.hidden = !opening;
          chToggle.setAttribute('aria-expanded', String(opening));
          chToggle.querySelector('.chev').textContent = opening ? '−' : '+';
          if (opening) { state.openChapters.add(c); await loadChapter(o, sec, c, body); } else state.openChapters.delete(c);
          return;
        }
        if (t.closest('#timeline-more')) {
          const button = t.closest('#timeline-more');
          button.disabled = true;
          state.visible += TIMELINE_PAGE;
          const tl = await ensureTimeline(o, state);
          const panel = $('#ent-tabs-panel', root);
          if (tl.items.length > panel.querySelectorAll('.ch-row').length) {
            // new rows arrived: redraw, keeping the open chapters
            panel.innerHTML = timelinePanel(o, state);
            for (const c of state.openChapters) { const b = $(`#ch-body-${c}`, panel); if (b && !b.hidden) loadChapter(o, sec, c, b); }
          } else {
            for (const el of $$('[data-row][hidden]', root)) if (Number(el.dataset.row) < state.visible) el.hidden = false;
            const left = tl.total - state.visible;
            if (left > 0) { button.textContent = `Show ${Math.min(left, TIMELINE_PAGE)} earlier chapters`; button.disabled = false; } else button.remove();
          }
          return;
        }
        const details = t.closest('.details-toggle');
        if (details) {
          const open = details.getAttribute('aria-expanded') !== 'true';
          details.setAttribute('aria-expanded', String(open));
          $('#infobox', root).classList.toggle('open', open);
          return;
        }
        const readMore = t.closest('.read-more');
        if (readMore) {
          const open = readMore.getAttribute('aria-expanded') !== 'true';
          const more = Number(readMore.dataset.more);
          readMore.setAttribute('aria-expanded', String(open));
          readMore.textContent = open ? 'Show less' : more ? `Continue reading · ${plural(more, 'more paragraph')}` : 'Read more';
          $('#story-text', root).classList.toggle('clamp', !open);
          return;
        }
        // a presence bar: that chapter, open, in "Chapter by chapter"
        const bar = t.closest('.presence-bars');
        if (bar) {
          const r = bar.getBoundingClientRect();
          const want = Math.min(store.ch, Math.max(1, Math.ceil((ev.clientX - r.left) / r.width * store.ch)));
          // the nearest chapter the entity is in
          const c = o.presence.reduce((best, p) => Math.abs(p.ch - want) < Math.abs(best - want) ? p.ch : best, o.presence[0].ch);
          state.visible = Math.max(state.visible, o.presence.filter(p => p.ch >= c).length);
          state.openChapters = new Set([c]);
          state.scrollTo = c;
          select('timeline', { focus: true });
          return;
        }
        if (t.closest('#recap-close')) {
          storage.set(recapKey(o), '1');
          t.closest('.recap').remove();
          return;
        }
        if (t.closest('#recap-all')) {
          // show every chapter since the last read one, the newest three open
          state.visible = Math.max(state.visible, o.since.chapters);
          state.openNewest = Math.min(3, o.since.chapters);
          select('timeline', { focus: true });
        }
      });
    },
  };
}
