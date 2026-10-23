// Topical tabs of an entity page (PLAN B8.1–B8.4, B8.7), the way large wikis split a page:
// Relationships · Abilities · Possessions · Progress · History for a character, Members for an
// organisation, Sequences for a pathway, and so on. Each tab shows its fields newest first, grouped
// by volume, from /api/entity/…/facts; Progress, Sequences, Members and Places use their own
// answers. Every list is bounded by the reading chapter like the rest of the page.
import { esc, enumLabel, roman, volumeParts } from '../util.js';
import { api } from '../api.js';
import { store, fieldLabel, shortTitle } from '../store.js';
import { entityLink, chip } from '../components/ui.js';

const PAGE = 25;
// tab key -> { label, fields, special }; a tab appears when one of its fields has facts or its
// special answer has rows
export const TOPICS = {
  characters: [
    { key: 'relationships', label: 'Relationships', fields: ['relationships_affiliations'], special: 'relations' },
    { key: 'abilities', label: 'Abilities', fields: ['skills_knowledge'] },
    { key: 'possessions', label: 'Possessions', fields: ['possessions'] },
    { key: 'progress', label: 'Progress', special: 'progress' },
    { key: 'history', label: 'History', fields: ['history', 'origin', 'origin_zhou_mingrui', 'origin_klein_moretti'] },
  ],
  organizations: [
    { key: 'members', label: 'Members', special: 'members' },
    { key: 'history', label: 'History', fields: ['history', 'description'] },
  ],
  locations: [
    { key: 'places', label: 'Places inside', special: 'places' },
    { key: 'events', label: 'Events', fields: ['events_here', 'history'] },
  ],
  items_artifacts: [
    { key: 'abilities', label: 'Abilities', fields: ['abilities_effects'] },
    { key: 'ownership', label: 'Ownership', fields: ['ownership_custody', 'origin'] },
  ],
  pathways_sequences: [
    { key: 'sequences', label: 'Sequences', special: 'sequences' },
    { key: 'abilities', label: 'Abilities', fields: ['abilities', 'characteristics'] },
    { key: 'potion', label: 'Potion', fields: ['potion_formula', 'ingredients', 'potions'] },
    { key: 'beyonders', label: 'Beyonders', fields: ['known_beyonders'] },
  ],
  rituals_abilities: [
    { key: 'how', label: 'How it works', fields: ['procedure', 'requirements_materials', 'effects', 'practitioners'] },
  ],
  creatures_entities: [
    { key: 'abilities', label: 'Abilities', fields: ['abilities'] },
  ],
};

// only what the text has said by then: ch 96 Low 9–8 · Mid 7–5 · High 4–1; ch 148 Saints 4–3 and
// Grounded Angels 2–1; ch 265 a Sequence 0 above Sequence 1, the Sequence of a True God
export const SEQUENCE_0_CH = 265;
function bandsAt(ch) {
  if (ch < 96) return [];
  const high = ch < 148 ? [{ label: 'High Sequence', from: 4, to: 1 }]
    : [{ label: 'High Sequence · Saint', from: 4, to: 3 }, { label: 'High Sequence · Grounded Angel', from: 2, to: 1 }];
  return [{ label: 'Low Sequence', from: 9, to: 8 }, { label: 'Mid Sequence', from: 7, to: 5 }, ...high,
    ...(ch >= SEQUENCE_0_CH ? [{ label: 'True God', from: 0, to: 0 }] : [])];
}
const band = (n) => bandsAt(store.ch).find(b => n <= b.from && n >= b.to)?.label ?? null;
const factValue = (f) => (f.ref ? entityLink(f.ref.section, f.ref.id, f.ref.heading) : esc(f.value));
const chChip = (ch) => `<span class="ch-chip${ch === store.ch ? ' current' : ''}">ch ${ch}</span>`;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Which topic tabs this entity has, with their counts (null when the count is not known up front).
export function topicTabs(o, sec, extra = {}) {
  const counts = new Map(o.fields.map(f => [f.key, f.count]));
  const out = [];
  for (const t of TOPICS[sec.key] ?? []) {
    const n = (t.fields ?? []).reduce((a, f) => a + (counts.get(f) ?? 0), 0);
    let has = n > 0;
    if (t.special === 'progress') has = o.progress?.length > 0;
    if (t.special === 'members') has = true; // the answer decides; an empty one says so
    if (t.special === 'relations') has ||= (o.infobox.affiliations?.length || o.infobox.former_affiliations?.length || o.related.total || o.backlinks.total) > 0;
    if (t.special === 'sequences') has = o.meta.kind === 'pathway' || o.meta.kind === 'sequence';
    if (t.special === 'places') has = !!extra.hasPlaces;
    if (has) out.push({ key: t.key, label: t.label, count: t.special === 'progress' ? o.progress.length : n || null });
  }
  return out;
}

export const isTopic = (sec, key) => (TOPICS[sec.key] ?? []).some(t => t.key === key);

// One field, newest first, grouped by volume, paged: the facts loaded so far are kept on the box
// and drawn again with each page.
async function fieldBlock(o, sec, field, box) {
  box._facts ??= [];
  const page = await api(`/api/entity/${o.section}/${encodeURIComponent(o.id)}/facts?ch=${store.ch}&field=${field}&limit=${PAGE}&offset=${box._facts.length}`);
  box._facts.push(...page.facts);
  const volumeOf = new Map(store.chapters.map(c => [c.n, c.volume]));
  const groups = [];
  for (const f of box._facts) {
    const v = volumeOf.get(f.ch) ?? null;
    if (groups.at(-1)?.v !== v) groups.push({ v, items: [] });
    groups.at(-1).items.push(f);
  }
  const volTitle = (v) => { const p = volumeParts(v); return p ? `Volume ${roman(p.n)}${p.name ? ` · ${esc(p.name)}` : ''}` : 'Earlier'; };
  const item = (f) => `<li class="${f.until != null || f.op === 'remove' ? 'ended' : ''}">${f.op === 'remove' ? '<span class="muted">No longer:</span> ' : ''}${factValue(f)} ${chChip(f.ch)}${f.until != null ? ` <span class="muted">until ch ${f.until}</span>` : ''}</li>`;
  box.querySelector('.topic-items').innerHTML = groups.map(g => `<h3 class="topic-vol">${volTitle(g.v)}</h3><ul class="topic-list">${g.items.map(item).join('')}</ul>`).join('');
  box.querySelector('.topic-more')?.remove();
  const left = page.total - box._facts.length;
  if (left > 0) box.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-outline topic-more">Show ${Math.min(PAGE, left)} more <span class="muted">(${left} left)</span></button>`);
  return page.total;
}

function fieldsPanel(o, sec, fields, { hatnote = '' } = {}) {
  const present = fields.filter(f => o.fields.some(x => x.key === f));
  return `${hatnote}${present.map(f => `<section class="topic-field" data-topic-field="${f}">
      <h2 id="t-${slug(f)}">${esc(fieldLabel(sec, f))} <span class="count-tag">${o.fields.find(x => x.key === f).count}</span></h2>
      <div class="topic-items"></div></section>`).join('') || '<p class="empty">Nothing recorded yet.</p>'}`;
}

const hatnote = (refs, label = 'Main article') => refs.length
  ? `<p class="hatnote">${esc(label)}: ${refs.map(r => entityLink(r.section, r.id, r.heading)).join(', ')}</p>` : '';

// ---- special panels ----

function progressPanel(o) {
  const rows = [...o.progress].sort((a, b) => b.sequence_number - a.sequence_number || a.ch - b.ch);
  let html = '', cur = null;
  for (const r of rows) {
    const b = band(r.sequence_number);
    if (b && b !== cur) html += `<tr class="band"><th colspan="3" scope="colgroup">${esc(b)}</th></tr>`;
    cur = b;
    html += `<tr><td class="seq-n">${r.sequence_number}</td>
      <th scope="row">${r.sequence ? entityLink(r.sequence.section, r.sequence.id, r.sequence.heading) : '<span class="sealed">name not recorded</span>'}
        ${r.pathway ? `<span class="muted">· ${entityLink(r.pathway.section, r.pathway.id, r.pathway.heading)}</span>` : ''}</th>
      <td>${chChip(r.ch)}</td></tr>`;
  }
  return `<h2 id="t-progress">Progress</h2>
    <table class="ladder-table progress-table"><thead><tr><th scope="col">Seq.</th><th scope="col">Name</th><th scope="col">Chapter</th></tr></thead><tbody>${html}</tbody></table>
    <p class="muted">The Sequences recorded so far, highest first. Later ones stay hidden until you read them.</p>`;
}

// the ladder 9 → 1 (→ 0 once the text has named it) of the pathway this entity belongs to (a pathway, or one of its Sequences)
async function sequencesPanel(o) {
  const tree = await api(`/api/pathways?ch=${store.ch}`);
  const g = tree.pathways.find(p => p.id === o.id) ?? tree.pathways.find(p => p.sequences.some(s => s.id === o.id));
  if (!g) return `<h2 id="t-sequences">Sequences</h2><p class="empty">Not placed in a pathway yet.</p>`;
  return `<h2 id="t-sequences">${g.id === o.id ? 'Sequences' : `Sequences of ${entityLink(g.section, g.id, g.heading)}`}</h2>${ladderHtml(g, { highlight: o.id })}
    <p class="muted">${g.kind === 'line' ? 'This line has no pathway entry yet; it is named after its first known Sequence. ' : ''}${seeAllPathways()}</p>`;
}

const seeAllPathways = () => `<a href="#/pathways">All pathways</a>`;

export function ladderHtml(g, { highlight = null } = {}) {
  const by = new Map();
  for (const s of g.sequences) (by.get(s.seq) ?? by.set(s.seq, []).get(s.seq)).push(s);
  let html = '', cur = null;
  for (let n = 9; n >= (store.ch >= SEQUENCE_0_CH ? 0 : 1); n--) {
    const b = band(n);
    if (b && b !== cur) html += `<tr class="band"><th colspan="2" scope="colgroup">${esc(b)}</th></tr>`;
    cur = b;
    const list = by.get(n) ?? [];
    html += `<tr class="${list.some(s => s.id === highlight) ? 'here' : ''}${list.length ? '' : ' unknown'}"><td class="seq-n">${n}</td>
      <td>${list.length ? list.map(s => entityLink(s.section, s.id, s.heading.replace(/\s*\(Sequence \d\)$/, ''))).join(' · ') : `<span class="sealed">not known at ch ${store.ch}</span>`}</td></tr>`;
  }
  return `<table class="ladder-table"><thead><tr><th scope="col">Seq.</th><th scope="col">Name</th></tr></thead><tbody>${html}</tbody></table>`;
}

async function membersPanel(o) {
  const m = await api(`/api/entity/organizations/${encodeURIComponent(o.id)}/members?ch=${store.ch}`);
  const row = (r, former) => `<tr>
    <th scope="row">${entityLink(r.section, r.id, r.name)}${r.title ? `<span class="muted member-title">${esc(r.title)}</span>` : ''}</th>
    <td class="num">ch ${r.joined}${former ? ` → ch ${r.left}` : ''}</td>
    <td class="status status-${esc(r.status ?? 'none')}">${r.status && r.status !== 'not_applicable' ? esc(enumLabel(r.status)) : '—'}</td>
    <td>${r.pathway ? `${entityLink(r.pathway.section, r.pathway.id, r.pathway.heading)}${r.sequence_number != null ? ` <span class="muted">· Seq ${r.sequence_number}</span>` : ''}` : '—'}</td></tr>`;
  const table = (list, former) => `<table class="rows-table members-table"><thead><tr><th scope="col">Name</th><th scope="col">${former ? 'Member' : 'Joined'}</th><th scope="col">Status</th><th scope="col">Pathway</th></tr></thead>
    <tbody>${list.map(r => row(r, former)).join('')}</tbody></table>`;
  return `<h2 id="t-members">Current members <span class="count-tag">${m.current.length}</span></h2>
    ${m.current.length ? table(m.current, false) : '<p class="empty">No member recorded through this chapter.</p>'}
    ${m.former.length ? `<h2 id="t-former">Former members <span class="count-tag">${m.former.length}</span></h2>${table(m.former, true)}` : ''}
    ${m.notes.length ? `<h2 id="t-member-notes">Notes on members</h2><ul class="topic-list">${m.notes.map(f => `<li>${factValue(f)} ${chChip(f.ch)}</li>`).join('')}</ul>` : ''}`;
}

// the places directly inside this location, from the location tree
async function placesPanel(o, tree) {
  const i = tree.findIndex(r => r.id === o.id);
  const kids = [];
  if (i >= 0) for (let j = i + 1; j < tree.length && (tree[j].depth ?? 0) > (tree[i].depth ?? 0); j++) if ((tree[j].depth ?? 0) === (tree[i].depth ?? 0) + 1) kids.push(tree[j]);
  return `<h2 id="t-places">Places inside <span class="count-tag">${kids.length}</span></h2>
    <ul class="topic-list">${kids.map(k => `<li>${entityLink('locations', k.id, k.heading)} ${chip(k.first_ch)}</li>`).join('')}</ul>`;
}

// Relationships (B8.7): the organisations (now / earlier), the linked entries by section, then
// the relationship facts by volume
function relationsHead(o) {
  const aff = o.infobox.affiliations ?? [], former = o.infobox.former_affiliations ?? [];
  const links = [...o.related.items, ...o.backlinks.items].filter((r, i, a) => a.findIndex(x => x.section === r.section && x.id === r.id) === i);
  const bySection = new Map();
  for (const r of links) (bySection.get(r.section) ?? bySection.set(r.section, []).get(r.section)).push(r);
  return `${aff.length || former.length ? `<h2 id="t-organizations">Organizations</h2><dl class="rel-list">
      ${aff.length ? `<dt>Now</dt><dd>${aff.map(r => entityLink(r.section, r.id, r.heading)).join(' · ')}</dd>` : ''}
      ${former.length ? `<dt>Earlier</dt><dd>${former.map(r => `${entityLink(r.section, r.id, r.heading)} <span class="muted">until ch ${r.until}</span>`).join(' · ')}</dd>` : ''}</dl>` : ''}
    ${bySection.size ? `<h2 id="t-linked">Linked entries</h2><dl class="rel-list">${[...bySection].map(([s, list]) =>
      `<dt>${esc(shortTitle(s))}</dt><dd>${list.map(r => entityLink(r.section, r.id, r.heading)).join(' · ')}</dd>`).join('')}</dl>` : ''}`;
}

// Render a topic tab into `panel`; resolves when its first page is in.
export async function renderTopic(key, o, sec, panel, cache) {
  const t = (TOPICS[sec.key] ?? []).find(x => x.key === key);
  if (!t) return;
  let head = '';
  if (t.special === 'progress') { panel.innerHTML = progressPanel(o); return; }
  if (t.special === 'sequences') { panel.innerHTML = '<p class="muted">Loading the pathway…</p>'; panel.innerHTML = await sequencesPanel(o); return; }
  if (t.special === 'members') { panel.innerHTML = '<p class="muted">Loading members…</p>'; panel.innerHTML = await membersPanel(o); return; }
  if (t.special === 'places') { panel.innerHTML = await placesPanel(o, cache.locations); }
  if (t.special === 'relations') head = relationsHead(o);
  const refs = t.key === 'abilities' && o.infobox.pathway ? [o.infobox.pathway] : [];
  const body = fieldsPanel(o, sec, t.fields ?? [], { hatnote: hatnote(refs) });
  if (t.special === 'places') panel.insertAdjacentHTML('beforeend', (t.fields ?? []).some(f => o.fields.some(x => x.key === f)) ? body : '');
  else panel.innerHTML = head + (head && !(t.fields ?? []).some(f => o.fields.some(x => x.key === f)) ? '' : body);
  await Promise.all([...panel.querySelectorAll('[data-topic-field]')].map(box => fieldBlock(o, sec, box.dataset.topicField, box)));
}

// "Show more" inside a topic tab
export async function moreTopic(o, sec, button) {
  const box = button.closest('[data-topic-field]');
  button.disabled = true;
  await fieldBlock(o, sec, box.dataset.topicField, box);
}

