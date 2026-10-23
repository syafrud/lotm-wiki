// API v2 (Fase 6 of rancangan/PLAN.md): small, pageable responses, one per screen.
// Every function is bounded by the reading chapter n: nothing tagged after n is read.
import {
  SECTIONS, SECTION_BY_KEY, SCALAR_FIELDS, REMOVABLE_FIELDS, IMPORTANCE,
  headingOf, latest, latestFact, metaOf, formerNames, parseRef, refSectionFor, withRemovals, currentCondition, groupEntities,
} from './lib/schema.js';
import { identities, refKeys, resolverAt, headingAt, resolveRefs, volumeRangeAt, buildInfo, chapters as allChapters } from './db-query.js';

// Fields that describe who an entity is; they are shown in the header/infobox, not as fact lists.
const HEADER_FIELDS = new Set([...SCALAR_FIELDS, 'aliases', 'headline', 'related', 'affiliations']);
const PREVIEW_MAX = 160;
const LATEST_PER_FIELD = 3;
const TOP_LINKS = 20;

const clip = (s, max) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const sqlList = (list) => list.map(f => `'${f}'`).join(', ');
const rank = (list, v) => { const i = list.indexOf(v); return i === -1 ? list.length : i; };
const fact = (r) => (r.op === 'remove' ? { value: r.value, ch: r.ch, op: 'remove' } : { value: r.value, ch: r.ch });

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// A fact whose whole value is a reference ("items_artifacts:rosago_characteristic") gets
// `ref: {section, id, heading}` so the page can link it; one whose target is not known through n
// is dropped, like any other later information.
const REF_VALUE = /^([a-z_]+):([a-z0-9_]+)$/;
const refOf = (value) => { const m = REF_VALUE.exec(String(value)); return m && SECTION_BY_KEY[m[1]] ? { section: m[1], id: m[2] } : null; };
const refKeysOf = (list) => list.map(f => refOf(f.value)).filter(Boolean).map(r => `${r.section}:${r.id}`);
function linkRefs(ids, list, n) {
  ids.prefetch(refKeysOf(list));
  const out = [];
  for (const f of list) {
    const r = refOf(f.value);
    if (!r) { out.push(f); continue; }
    const heading = headingAt(ids, r.section, r.id, n);
    if (heading) out.push({ ...f, ref: { ...r, heading } });
  }
  return out;
}

// ---- /api/meta ------------------------------------------------------------------------------

// Build id, chapter count and the volumes that have started by n (with their end once finished).
export function meta(db, n) {
  const list = allChapters(db);
  const volumes = [];
  for (const c of list) {
    if (c.n > n) break;
    let v = volumes.find(x => x.name === c.volume);
    if (!v) volumes.push((v = { name: c.volume, start: c.n, end: null, read: c.n }));
    v.read = c.n;
  }
  // a volume is finished once the next one has started; its last chapter is then known
  for (let i = 0; i < volumes.length - 1; i++) volumes[i].end = volumes[i].read;
  return {
    build: buildInfo(db),
    ch: n,
    max_ch: list.at(-1)?.n ?? 0,
    volumes: volumes.map(({ name, start, end }) => ({ name, start, end })),
  };
}

// ---- /api/volume/:i --------------------------------------------------------------------------

// One started volume (1-based, in reading order) as one line per chapter through n.
export function volume(db, i, n) {
  const v = meta(db, n).volumes[i - 1];
  if (!v) return null;
  const chapters = db.prepare('SELECT n, title, headline FROM chapters WHERE volume = ? AND n <= ? ORDER BY n').all(v.name, n)
    .map(c => ({ n: c.n, title: c.title, headline: c.headline || null }));
  return { index: i, ...v, ch: n, chapters };
}

// ---- /api/counts ----------------------------------------------------------------------------

// Per section: entities known through n, new in n, and older entities updated in n.
export function counts(db, n) {
  const rows = db.prepare(`
    SELECT section, COUNT(*) total, SUM(first = ?) fresh, SUM(first < ? AND touched) updated
    FROM (SELECT section, id, MIN(ch) first, MAX(ch = ? AND n_facts > 0) touched FROM entity_chapters WHERE ch <= ? GROUP BY section, id)
    GROUP BY section`).all(n, n, n, n);
  const by = Object.fromEntries(rows.map(r => [r.section, r]));
  return {
    ch: n,
    sections: SECTIONS.map(s => ({ key: s.key, total: by[s.key]?.total ?? 0, new: by[s.key]?.fresh ?? 0, updated: by[s.key]?.updated ?? 0 })),
  };
}

// ---- /api/section/:key ----------------------------------------------------------------------

const SORTS = {
  importance: (a, b) => a.imp - b.imp || a.first_ch - b.first_ch || a.heading.localeCompare(b.heading),
  name: (a, b) => a.heading.localeCompare(b.heading),
  first: (a, b) => a.first_ch - b.first_ch || a.imp - b.imp,
  last: (a, b) => b.last_ch - a.last_ch || a.imp - b.imp,
  appearances: (a, b) => b.appearances - a.appearances || a.imp - b.imp,
};

export const STALE_AFTER = 50; // a row not seen for more than this many chapters is "stale"

// Slim rows of one section through n. view "list" pages them; view "groups" returns every
// matching row plus the section's grouping (entries as ids).
//   imp: one importance or several ("major,notable"); q: part of the heading or id.
// Also returned: all (rows before any filter), imp_counts (per importance, after the name filter),
// stale (matching rows not seen in the last STALE_AFTER chapters), max_appearances.
//   start: one letter (A–Z) or '#' — only names starting with it (the A–Z row, PLAN B8.5)
export function sectionRows(db, key, n, { imp = null, sort = 'importance', q = '', start = null, offset = 0, limit = 50, view = 'list' } = {}) {
  if (!SECTION_BY_KEY[key]) throw new ApiError(404, 'unknown section');
  if (!SORTS[sort]) throw new ApiError(400, `sort is one of ${Object.keys(SORTS).join(', ')}`);
  const imps = imp ? String(imp).split(',').filter(Boolean) : [];
  if (imps.some(i => !IMPORTANCE.includes(i))) throw new ApiError(400, `imp is one or more of ${IMPORTANCE.join(', ')}`);

  // chapters each entity appears in: the grouped view needs every one (grouping by appearances),
  // the list only the first, the last and how many (one row per entity instead of per chapter)
  const chs = new Map(); // id -> { first, last, count, list? }
  if (view === 'groups') {
    for (const r of db.prepare('SELECT id, ch FROM entity_chapters WHERE section = ? AND ch <= ? ORDER BY ch').all(key, n)) {
      const c = chs.get(r.id) ?? chs.set(r.id, { first: r.ch, list: [] }).get(r.id);
      c.list.push(r.ch); c.last = r.ch; c.count = c.list.length;
    }
  } else {
    for (const r of db.prepare(`SELECT id, MIN(ch) first, MAX(ch) last, COUNT(*) count FROM entity_chapters
        WHERE section = ? AND ch <= ? GROUP BY id ORDER BY MIN(ch), id`).all(key, n)) chs.set(r.id, r);
  }
  // scalar facts + what grouping needs (affiliations, with removals); headlines and previews are
  // read later, only for the rows this answer returns (PLAN B2.0: half the rows of this query)
  const ents = new Map();
  for (const r of db.prepare(`SELECT entity_id, field, value, ch, op FROM facts
      WHERE section = ? AND ch <= ? AND field IN (${sqlList([...SCALAR_FIELDS, 'affiliations'])}) ORDER BY ch, ord`).all(key, n)) {
    const e = ents.get(r.entity_id) ?? ents.set(r.entity_id, {}).get(r.entity_id);
    (e[r.field] ??= []).push(fact(r));
  }

  // identities of what these entities point at: an organisation's "(parent or base)", the
  // organisations characters are grouped under, a Sequence's pathway
  // (grouping walks further up parent chains; those come in on demand)
  const ids = identities(db, n).prefetch([...ents.values()].flatMap(e => refKeys(key, e)));
  const resolve = resolverAt(ids, n);
  const needle = String(q ?? '').trim().toLowerCase();
  let rows = [];
  let all = 0, maxApps = 0;
  const impCounts = Object.fromEntries(IMPORTANCE.map(i => [i, 0]));
  for (const [id, c] of chs) {
    const e = ents.get(id) ?? {};
    if (c.list) e._chapters = c.list.map(ch => ({ value: '', ch })); // for grouping by appearances
    const heading = headingOf(key, id, e, n, resolve);
    const m = metaOf(e, n);
    all++;
    maxApps = Math.max(maxApps, c.count);
    if (needle && !heading.toLowerCase().includes(needle) && !id.includes(needle)) continue;
    if (start && initialOf(heading) !== start) continue;
    if (m.importance in impCounts) impCounts[m.importance]++;
    if (imps.length && !imps.includes(m.importance)) continue;
    rows.push({
      id, heading, meta: m,
      first_ch: c.first, last_ch: c.last, appearances: c.count, isNew: c.first === n,
      preview: null,
      imp: rank(IMPORTANCE, m.importance), _entity: e,
    });
  }
  rows.sort(SORTS[sort]);
  const slim = (r) => { const { imp: _i, _entity, ...rest } = r; return rest; };
  const withPreviews = (list) => { const p = previewsFor(db, key, list.map(x => x.id), n); for (const x of list) x.preview = p.get(x.id) ?? null; return list; };
  const stats = { all, imp_counts: impCounts, stale: rows.filter(r => n - r.last_ch > STALE_AFTER).length, max_appearances: maxApps };

  if (view === 'groups') {
    const vr = volumeRangeAt(db, n);
    const strip = (g) => ({ key: g.key, title: g.title, entries: g.entries.map(x => x.id), children: (g.children ?? []).map(strip) });
    // base order: first chapter, then extraction order (ties inside a group keep it)
    const base = new Map(db.prepare('SELECT id, first_ch, rowid r FROM entities WHERE section = ?').all(key).map(x => [x.id, x]));
    const ordered = [...rows].sort((x, y) => (base.get(x.id)?.first_ch ?? 0) - (base.get(y.id)?.first_ch ?? 0) || (base.get(x.id)?.r ?? 0) - (base.get(y.id)?.r ?? 0));
    const grouped = groupEntities(key, ordered.map(r => ({ id: r.id, entity: r._entity })), n, resolve, { volumeStart: vr.start });
    // locations are one depth-first tree: each row gets its depth and ancestor headings
    const byId = new Map(rows.map(r => [r.id, r]));
    for (const g of grouped) for (const x of g.entries) if (x.depth != null) Object.assign(byId.get(x.id), { depth: x.depth, path: x.path });
    return { section: key, ch: n, total: rows.length, ...stats, rows: withPreviews(rows).map(slim), groups: grouped.map(strip) };
  }
  if (view !== 'list') throw new ApiError(400, 'view is list or groups');
  return { section: key, ch: n, total: rows.length, ...stats, offset, limit, rows: withPreviews(rows.slice(offset, offset + limit)).map(slim) };
}

// First letter for the A–Z row: A–Z, or '#' for anything else (digits, quotes, other scripts).
// (the heading as sorted by "A–Z", leading quotes skipped)
export const initialOf = (name) => { const c = String(name ?? '').replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };

// The preview line of each entity: its latest headline, else its newest fact outside the header
// fields. One indexed lookup per entity (facts_field / facts_entity), not a scan of the section.
function previewsFor(db, key, ids, n) {
  const out = new Map();
  if (!ids.length) return out;
  for (const r of db.prepare(`SELECT j.value entity_id, f.value, f.ch FROM json_each(?) j JOIN facts f ON f.id = (
      SELECT x.id FROM facts x WHERE x.section = ? AND x.entity_id = j.value AND x.field = 'headline' AND x.ch <= ?
      ORDER BY x.ch DESC, x.ord DESC, x.id DESC LIMIT 1)`).all(JSON.stringify(ids), key, n)) {
    out.set(r.entity_id, { field: 'headline', value: r.value, ch: r.ch });
  }
  const rest = ids.filter(id => !out.has(id));
  if (!rest.length) return out;
  for (const r of db.prepare(`SELECT j.value entity_id, f.field, f.value, f.ch FROM json_each(?) j JOIN facts f ON f.id = (
      SELECT x.id FROM facts x WHERE x.section = ? AND x.entity_id = j.value AND x.ch <= ? AND x.field NOT IN (${sqlList([...HEADER_FIELDS])})
      ORDER BY x.ch DESC, x.ord, x.id LIMIT 1)`).all(JSON.stringify(rest), key, n)) {
    out.set(r.entity_id, { field: r.field, value: clip(r.value, PREVIEW_MAX), ch: r.ch });
  }
  return out;
}

// ---- /api/locations -------------------------------------------------------------------------

// Location hierarchy through chapter n: depth-first rows with depth and path.
export function locations(db, n) {
  const r = sectionRows(db, 'locations', n, { view: 'groups' });
  const byId = new Map(r.rows.map(x => [x.id, x]));
  return (r.groups[0]?.entries ?? []).map(id => byId.get(id)).filter(Boolean);
}

// ---- /api/entity/:s/:id?view=overview -------------------------------------------------------

function loadEntity(db, section, id, n) {
  if (!SECTION_BY_KEY[section]) throw new ApiError(404, 'unknown section');
  const rows = db.prepare('SELECT field, value, ch, op FROM facts WHERE section = ? AND entity_id = ? AND ch <= ? ORDER BY ch, ord').all(section, id, n);
  if (!rows.length) return null;
  const facts = {};
  for (const r of rows) (facts[r.field] ??= []).push(fact(r));
  const active = {};
  for (const f of REMOVABLE_FIELDS) {
    if (!facts[f]) continue;
    const r = withRemovals(facts[f], n, f, section);
    facts[f] = r.all;
    active[f] = r.active;
  }
  return { facts, active };
}

// Everything the entity page shows above the fold, with long lists cut to their newest items.
const RECENT_DEFAULT = 10;     // "Since ch X" covers the last 10 chapters when there is no summary
const RECENT_MAX = 30;
const CONNECTIONS_TOP = 9;
const CONNECTIONS_RECENT = 50;
const RECAP_FIELDS = ['status', 'sequence_number', 'title', 'true_name', 'name', 'role'];

// One line for what chapter ch said about the entity: its headline, else its first bio fact,
// else (timeline entries) its event, else its first fact outside the header fields — never a bare
// date or a reference id.
const NOT_A_LINE = new Set(['date']);
function chapterLine(facts, ch) {
  const pick = (field) => (facts[field] ?? []).find(f => f.ch === ch && f.op !== 'remove');
  let f = pick('headline'), source = 'headline';
  if (!f) { f = pick('bio'); source = 'bio'; }
  if (!f) { f = pick('event'); source = 'event'; }
  if (!f) {
    source = 'fact';
    for (const [field, list] of Object.entries(facts)) {
      if (HEADER_FIELDS.has(field) || NOT_A_LINE.has(field)) continue;
      f = list.find(x => x.ch === ch && x.op !== 'remove' && !refOf(x.value));
      if (f) break;
    }
  }
  return f ? { text: clip(f.value, PREVIEW_MAX), source } : null;
}

//   since: a chapter A < n — adds `since`: what changed for this entity in (A, n] (recap banner)
export function entityOverview(db, section, id, n, { since = null } = {}) {
  const loaded = loadEntity(db, section, id, n);
  if (!loaded) return null;
  const { facts, active } = loaded;
  const ids = identities(db, n).prefetch(refKeys(section, facts));
  const resolve = resolverAt(ids, n);
  const sec = SECTION_BY_KEY[section];

  const chapterRows = db.prepare(`SELECT ec.ch, c.title, ec.n_facts FROM entity_chapters ec JOIN chapters c ON c.n = ec.ch
    WHERE ec.section = ? AND ec.id = ? AND ec.ch <= ? ORDER BY ec.ch`).all(section, id, n);

  const fields = [];
  const order = [...sec.fields, ...Object.keys(facts).filter(f => !sec.fields.includes(f))];
  for (const field of order) {
    const list = facts[field];
    if (!list?.length || HEADER_FIELDS.has(field)) continue;
    const shown = field === 'current_condition' ? currentCondition(list, n) : [...list].reverse().slice(0, LATEST_PER_FIELD);
    fields.push({ key: field, count: list.length, latest: linkRefs(ids, shown, n) });
  }

  const related = resolveRefs(ids, section, active.related, n).filter(r => !(r.section === section && r.id === id));
  const affiliations = resolveRefs(ids, refSectionFor('affiliations', section), active.affiliations, n);
  const ended = (facts.affiliations ?? []).filter(f => f.until != null);
  const former_affiliations = ended.flatMap(f => resolveRefs(ids, refSectionFor('affiliations', section), [f], n).map(r => ({ ...r, until: f.until })));

  const sources = db.prepare(`SELECT src_section, src_id, MAX(ch) last FROM refs
    WHERE dst_section = ? AND dst_id = ? AND ch <= ? GROUP BY src_section, src_id ORDER BY last DESC`).all(section, id, n)
    .filter(r => !(r.src_section === section && r.src_id === id));
  ids.prefetch(sources.slice(0, TOP_LINKS).map(r => `${r.src_section}:${r.src_id}`));
  const backlinks = sources.slice(0, TOP_LINKS)
    .map(r => ({ section: r.src_section, id: r.src_id, heading: headingAt(ids, r.src_section, r.src_id, n), ch: r.last }))
    .filter(r => r.heading);

  const m = metaOf(facts, n);
  const infobox = {};
  for (const f of ['parent', 'base', 'pathway']) {
    if (m[f]) infobox[f] = resolveRefs(ids, refSectionFor(f, section), [{ value: m[f], ch: latestFact(facts[f], n).ch }], n)[0] ?? null;
  }
  const summary = db.prepare(`SELECT text, through_ch FROM entity_summaries
    WHERE section = ? AND id = ? AND through_ch <= ? ORDER BY through_ch DESC LIMIT 1`).get(section, id, n) ?? null;
  const headline = latestFact(facts.headline, n);
  const metaCh = {};
  for (const f of Object.keys(m)) metaCh[f] = latestFact(facts[f], n)?.ch ?? null;

  // "Since ch X": one line per chapter after the summary (or the last RECENT_DEFAULT chapters)
  const recentFrom = summary?.through_ch ?? Math.max(0, n - RECENT_DEFAULT);
  const recent = chapterRows.filter(r => r.ch > recentFrom).reverse().slice(0, RECENT_MAX)
    .map(r => ({ ch: r.ch, title: r.title, ...(chapterLine(facts, r.ch) ?? { text: '', source: null }) }));

  // most connected (PLAN B1.3): entities that share the most chapters with this one — every
  // chapter both appear in (facts or mentions), each of the last CONNECTIONS_RECENT chapters
  // counting 1.5 — plus the chapters that link them by reference. A character's list keeps to people.
  const score = new Map(); // "section:id" -> { together, score }
  const peopleOnly = section === 'characters' ? 'characters' : null;
  const add = (sec2, id2, together, points) => {
    if (sec2 === section && id2 === id) return;
    if (section === 'characters' && sec2 !== 'characters') return;
    const k = `${sec2}:${id2}`;
    const s = score.get(k) ?? score.set(k, { together: 0, score: 0 }).get(k);
    s.together += together; s.score += points;
  };
  for (const r of db.prepare(`SELECT b.section s, b.id i, COUNT(*) c, SUM(b.ch > ?) recent
      FROM entity_chapters a JOIN entity_chapters b ON b.ch = a.ch AND NOT (b.section = a.section AND b.id = a.id)
      WHERE a.section = ? AND a.id = ? AND a.ch <= ? AND (? IS NULL OR b.section = ?) GROUP BY b.section, b.id`).all(n - CONNECTIONS_RECENT, section, id, n, peopleOnly, peopleOnly)) add(r.s, r.i, r.c, r.c + r.recent / 2);
  for (const r of db.prepare(`SELECT dst_section s, dst_id i, COUNT(DISTINCT ch) c FROM refs
      WHERE src_section = ? AND src_id = ? AND ch <= ? AND op = 'add' GROUP BY dst_section, dst_id`).all(section, id, n)) add(r.s, r.i, 0, r.c);
  for (const r of db.prepare(`SELECT src_section s, src_id i, COUNT(DISTINCT ch) c FROM refs
      WHERE dst_section = ? AND dst_id = ? AND ch <= ? AND op = 'add' GROUP BY src_section, src_id`).all(section, id, n)) add(r.s, r.i, 0, r.c);
  const ranked = [...score].sort((a, b) => b[1].score - a[1].score || b[1].together - a[1].together || a[0].localeCompare(b[0]));
  ids.prefetch(ranked.slice(0, CONNECTIONS_TOP * 2).map(([k]) => k));
  const connections = [];
  for (const [k, s] of ranked) {
    if (connections.length >= CONNECTIONS_TOP) break;
    const [sec2, ...rest] = k.split(':');
    const heading = headingAt(ids, sec2, rest.join(':'), n);
    if (heading) connections.push({ section: sec2, id: rest.join(':'), heading, name: latest(ids.get(sec2, rest.join(':'))?.name, n) ?? heading, count: s.together });
  }

  // recap for a reader coming back from chapter `since`
  let recap = null;
  if (since != null && since < n) {
    const inRange = (f) => f.ch > since && f.ch <= n;
    const changes = RECAP_FIELDS.flatMap(f => (facts[f] ?? []).filter(inRange).map(x => ({ field: f, value: x.value, ch: x.ch })));
    const affField = refSectionFor('affiliations', section);
    const joined = resolveRefs(ids, affField, (facts.affiliations ?? []).filter(f => f.op !== 'remove' && inRange(f)), n);
    const left = resolveRefs(ids, affField, (facts.affiliations ?? []).filter(f => f.until != null && f.until > since).map(f => ({ ...f, ch: f.until })), n);
    const rows = chapterRows.filter(inRange);
    recap = {
      from: since,
      facts: rows.reduce((a, r) => a + r.n_facts, 0),
      chapters: rows.length,
      is_new: (chapterRows[0]?.ch ?? 0) > since,
      changes, joined, left,
      headlines: (facts.headline ?? []).filter(inRange).map(f => ({ value: f.value, ch: f.ch })),
    };
  }

  return {
    section, id,
    heading: headingOf(section, id, facts, n, resolve),
    name: latest(facts.name, n) ?? id,
    former_names: formerNames(facts, n).map(f => f.value),
    aliases: (facts.aliases ?? []).map(f => f.value),
    meta: m,
    meta_ch: metaCh,
    facts_total: Object.values(facts).reduce((a, l) => a + l.length, 0),
    first_ch: chapterRows[0]?.ch ?? null,
    last_ch: chapterRows.at(-1)?.ch ?? null,
    headline: headline ? { value: headline.value, ch: headline.ch } : null,
    summary,
    infobox: { ...infobox, affiliations, former_affiliations },
    current_condition: facts.current_condition ? currentCondition(facts.current_condition, n) : null,
    fields,
    chapters_total: chapterRows.length, // the list itself: /api/entity/:s/:id/chapters (PLAN B2.1)
    // facts per chapter present, oldest first (the presence scrubber, PLAN B7); 0 = only named there
    presence: chapterRows.map(r => ({ ch: r.ch, facts: r.n_facts })),
    // a character's Sequences, oldest first (the Progress tab, PLAN B8.2)
    progress: section === 'characters' && facts.sequence_number?.length ? progressOf(facts, n, pathwayTree(db, n)) : [],
    entries_total: db.prepare('SELECT COUNT(*) c FROM diary_entries WHERE section = ? AND id = ? AND ch <= ?').get(section, id, n).c, // /entries (D1)
    related: { total: related.length, items: related.slice(0, TOP_LINKS) },
    backlinks: { total: sources.length, items: backlinks },
    recent: { from: recentFrom, total: chapterRows.filter(r => r.ch > recentFrom).length, items: recent },
    connections: { total: score.size, items: connections },
    since: recap,
  };
}

// ---- /api/chapter/:n?view=lines --------------------------------------------------------------

// Chapter n as the overview shows it: the chapter itself, its notes, and one line per entity it
// introduced or updated, grouped by section (most important first; new entities flagged).
export function chapterLines(db, n) {
  const chapter = db.prepare('SELECT n, title, volume, summary, headline FROM chapters WHERE n = ?').get(n);
  if (!chapter) return null;
  const touched = db.prepare(`SELECT ec.section, ec.id, ec.n_facts, (SELECT MIN(ch) FROM entity_chapters x WHERE x.section = ec.section AND x.id = ec.id) first
    FROM entity_chapters ec WHERE ec.ch = ? AND ec.n_facts > 0`).all(n); // mentions (n_facts 0) are appearances, not updates
  const facts = new Map();
  for (const r of db.prepare('SELECT section, entity_id, field, value, ch, op FROM facts WHERE ch = ? ORDER BY ord').all(n)) {
    const k = `${r.section}:${r.entity_id}`;
    const e = facts.get(k) ?? facts.set(k, {}).get(k);
    (e[r.field] ??= []).push(fact(r));
  }
  const ids = identities(db, n).prefetch(touched.map(t => `${t.section}:${t.id}`));
  const importance = new Map(db.prepare(`SELECT section || ':' || entity_id k, value FROM facts WHERE field = 'importance' AND ch <= ? ORDER BY ch, ord`).all(n).map(r => [r.k, r.value]));
  const sections = SECTIONS.map(sec => {
    const items = touched.filter(t => t.section === sec.key).map(t => {
      const k = `${t.section}:${t.id}`;
      const line = chapterLine(facts.get(k) ?? {}, n);
      // the first value this chapter ended (op "remove"), for the "−" rows of the changes ledger
      const removed = Object.entries(facts.get(k) ?? {}).flatMap(([field, list]) => list.filter(f => f.op === 'remove').map(f => ({ field, value: f.value })))[0];
      const ended = removed ? { field: removed.field, ...linkRefs(ids, [{ value: removed.value }], n)[0] ?? { value: removed.value } } : null;
      return { id: t.id, heading: headingAt(ids, t.section, t.id, n) ?? t.id, isNew: t.first === n, importance: importance.get(k) ?? null, facts: t.n_facts, line: line?.text ?? '', ended };
    }).sort((a, b) => (b.isNew - a.isNew) || rank(IMPORTANCE, a.importance) - rank(IMPORTANCE, b.importance) || b.facts - a.facts);
    return { key: sec.key, items };
  }).filter(s2 => s2.items.length);
  const notes = db.prepare('SELECT kind, value, ch FROM chapter_notes WHERE ch = ? ORDER BY ord').all(n);
  // diary pages read in this chapter (PLAN D1.5), word for word, in page order
  const diaryRows = db.prepare('SELECT section, id, date, year, text FROM diary_entries WHERE ch = ? ORDER BY section, id, ord').all(n);
  const diaryIds = identities(db, n).prefetch(diaryRows.map(r => `${r.section}:${r.id}`));
  // named in the chapter without new facts (`mentions`): the "Appearing" chips (design 5a)
  const named = db.prepare('SELECT section, id FROM entity_chapters WHERE ch = ? AND n_facts = 0 ORDER BY section, id').all(n);
  const namedIds = identities(db, n).prefetch(named.map(r => `${r.section}:${r.id}`));
  return {
    chapter: { n: chapter.n, title: chapter.title, volume: chapter.volume, summary: chapter.summary, headline: chapter.headline || null },
    sections,
    appearing: named.map(r => ({ section: r.section, id: r.id, heading: headingAt(namedIds, r.section, r.id, n) ?? r.id })),
    diary: diaryRows.map(r => ({ section: r.section, id: r.id, heading: headingAt(diaryIds, r.section, r.id, n) ?? r.id, date: r.date, year: r.year, text: r.text })),
    foreshadowing: notes.filter(x => x.kind === 'foreshadowing').map(({ value, ch }) => ({ value, ch })),
    open_questions: notes.filter(x => x.kind === 'open_question').map(({ value, ch }) => ({ value, ch })),
  };
}

// ---- /api/entity/:s/:id/chapters ------------------------------------------------------------

// The chapters an entity appears in through n, newest first, paged: number, title, facts recorded
// there (0 for a chapter that only names it) and the entity's headline in that chapter.
export function entityChapters(db, section, id, n, { offset = 0, limit = 50 } = {}) {
  if (!SECTION_BY_KEY[section]) throw new ApiError(404, 'unknown section');
  const total = db.prepare('SELECT COUNT(*) c FROM entity_chapters WHERE section = ? AND id = ? AND ch <= ?').get(section, id, n).c;
  if (!total) return null;
  const rows = db.prepare(`SELECT ec.ch, c.title, ec.n_facts FROM entity_chapters ec JOIN chapters c ON c.n = ec.ch
    WHERE ec.section = ? AND ec.id = ? AND ec.ch <= ? ORDER BY ec.ch DESC LIMIT ? OFFSET ?`).all(section, id, n, limit, offset);
  const headlines = new Map();
  if (rows.length) {
    for (const r of db.prepare(`SELECT ch, value FROM facts WHERE section = ? AND entity_id = ? AND field = 'headline' AND ch <= ? AND ch >= ? ORDER BY ch, ord`)
      .all(section, id, rows[0].ch, rows.at(-1).ch)) headlines.set(r.ch, r.value);
  }
  return { section, id, ch: n, total, offset, limit, items: rows.map(r => ({ ch: r.ch, title: r.title, count: r.n_facts, headline: headlines.get(r.ch) ?? null })) };
}

// ---- /api/entity/:s/:id/entries -------------------------------------------------------------

// Dated diary entries of one document through n (PLAN D1.5), in reading order: the chapter where
// they are read, then their order on the page. Null when the entity is unknown through n.
export function entityEntries(db, section, id, n, { offset = 0, limit = 50 } = {}) {
  if (!SECTION_BY_KEY[section]) throw new ApiError(404, 'unknown section');
  const known = db.prepare('SELECT 1 FROM entity_chapters WHERE section = ? AND id = ? AND ch <= ? LIMIT 1').get(section, id, n);
  if (!known) return null;
  const total = db.prepare('SELECT COUNT(*) c FROM diary_entries WHERE section = ? AND id = ? AND ch <= ?').get(section, id, n).c;
  const rows = db.prepare(`SELECT d.ch, c.title, d.date, d.year, d.text FROM diary_entries d JOIN chapters c ON c.n = d.ch
    WHERE d.section = ? AND d.id = ? AND d.ch <= ? ORDER BY d.ch, d.ord LIMIT ? OFFSET ?`).all(section, id, n, limit, offset);
  return { section, id, ch: n, total, offset, limit, items: rows.map(r => ({ ch: r.ch, title: r.title, date: r.date, year: r.year, text: r.text })) };
}

// ---- /api/pathways (PLAN B8.3) --------------------------------------------------------------

// The pathways known through n as ladders 9 → 0. A Sequence's `pathway` may point at the pathway
// or at another Sequence of the same line (often its Sequence 9, when the pathway itself has no
// entry yet): it is followed up to the root, and a Sequence that others point to stands in for its
// pathway (kind "line"). Sequences that lead nowhere are listed under `unplaced`.
export function pathwayTree(db, n) {
  const S = 'pathways_sequences';
  const known = new Set(db.prepare('SELECT DISTINCT id FROM entity_chapters WHERE section = ? AND ch <= ?').all(S, n).map(r => r.id));
  const e = new Map();
  for (const id of known) e.set(id, {});
  for (const r of db.prepare(`SELECT entity_id, field, value FROM facts WHERE section = ? AND ch <= ? AND op = 'add'
      AND field IN ('kind', 'pathway', 'sequence_number') ORDER BY ch, ord`).all(S, n)) {
    if (e.has(r.entity_id)) e.get(r.entity_id)[r.field] = r.value; // the latest value wins
  }
  const target = (v) => { const r = refOf(v) ?? { section: S, id: String(v) }; return r.section === S && e.has(r.id) ? r.id : null; };
  const rootOf = (id) => {
    let cur = id;
    for (let i = 0; i < 5; i++) {
      const x = e.get(cur);
      if (x.kind === 'pathway') return cur;
      const t = x.pathway ? target(x.pathway) : null;
      if (!t || t === cur) return cur;
      cur = t;
    }
    return cur;
  };
  const num = (x) => /^\d$/.test(String(x.sequence_number ?? '')) ? Number(x.sequence_number) : null;
  const ids = identities(db, n).prefetch([...known].map(id => `${S}:${id}`));
  const groups = new Map(); // root id -> group
  const group = (root) => groups.get(root) ?? groups.set(root, {
    section: S, id: root, kind: e.get(root).kind === 'pathway' ? 'pathway' : 'line',
    heading: headingAt(ids, S, root, n) ?? root, sequences: [],
  }).get(root);
  for (const [id, x] of e) if (x.kind === 'pathway') group(id);
  const pointedAt = new Set();
  for (const [id, x] of e) if (x.kind !== 'pathway' && x.pathway && target(x.pathway) && target(x.pathway) !== id) pointedAt.add(rootOf(id));
  const unplaced = [];
  for (const [id, x] of e) {
    if (x.kind !== 'sequence' || num(x) == null) continue;
    const root = rootOf(id);
    const item = { seq: num(x), section: S, id, heading: headingAt(ids, S, id, n) ?? id }; // `seq`, not `n`: n is a chapter
    if (root === id && !pointedAt.has(id) && e.get(id).kind !== 'pathway') unplaced.push(item);
    else group(root).sequences.push(item);
  }
  const byNum = (a, b) => b.seq - a.seq || a.heading.localeCompare(b.heading);
  const out = [...groups.values()].map(g => ({ ...g, sequences: g.sequences.sort(byNum) }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pathway' ? -1 : 1) || a.heading.localeCompare(b.heading));
  return { ch: n, pathways: out, unplaced: unplaced.sort(byNum), rootOf: (id) => (e.has(id) ? rootOf(id) : null) };
}

export function pathways(db, n) {
  const { rootOf, ...tree } = pathwayTree(db, n);
  return tree;
}

// A character's Sequences through n (PLAN B8.2): one row per `sequence_number` fact, with the
// pathway in force at that chapter and the Sequence entry of that pathway and number.
function progressOf(facts, n, tree) {
  if (!facts.sequence_number?.length) return [];
  const roots = new Map(tree.pathways.map(g => [g.id, g]));
  return facts.sequence_number.filter(f => f.ch <= n && f.op !== 'remove').map(f => {
    const pf = latestFact(facts.pathway, f.ch);
    const ref = pf ? refOf(pf.value) ?? { section: 'pathways_sequences', id: pf.value } : null;
    const root = ref ? tree.rootOf(ref.id) : null;
    const g = root ? roots.get(root) : null;
    const seq = g?.sequences.find(s => String(s.seq) === String(f.value)) ?? null;
    return {
      ch: f.ch, sequence_number: Number(f.value),
      pathway: g ? { section: g.section, id: g.id, heading: g.heading } : null,
      sequence: seq ? { section: seq.section, id: seq.id, heading: seq.heading } : null,
    };
  });
}

// ---- /api/entity/organizations/:id/members (PLAN B8.4) ---------------------------------------

// The characters whose `affiliations` point at this organisation through n: current members first
// (by the chapter they joined), then former ones (an `op: remove` ended it). `notes` are the
// organisation's own `members` facts (free text, newest first).
export function entityMembers(db, id, n) {
  const known = db.prepare("SELECT 1 FROM entity_chapters WHERE section = 'organizations' AND id = ? AND ch <= ? LIMIT 1").get(id, n);
  if (!known) return null;
  const state = new Map(); // character id -> { joined, left, active }
  for (const r of db.prepare(`SELECT src_id, ch, op FROM refs WHERE src_section = 'characters' AND field = 'affiliations'
      AND dst_section = 'organizations' AND dst_id = ? AND ch <= ? ORDER BY ch`).all(id, n)) {
    const s = state.get(r.src_id) ?? state.set(r.src_id, { joined: r.ch, left: null, active: false }).get(r.src_id);
    if (r.op === 'remove') { s.active = false; s.left = r.ch; } else { if (!s.active && s.left != null) s.joined = r.ch; s.active = true; s.left = null; }
  }
  const ids = identities(db, n).prefetch([...state.keys()].map(c => `characters:${c}`));
  const meta = new Map();
  if (state.size) {
    for (const r of db.prepare(`SELECT entity_id, field, value, ch FROM facts WHERE section = 'characters' AND ch <= ?
        AND field IN ('title', 'status', 'pathway', 'sequence_number') AND op = 'add' AND entity_id IN (SELECT value FROM json_each(?)) ORDER BY ch, ord`)
      .all(n, JSON.stringify([...state.keys()]))) {
      const m = meta.get(r.entity_id) ?? meta.set(r.entity_id, {}).get(r.entity_id);
      m[r.field] = r.value;
    }
  }
  const tree = state.size ? pathwayTree(db, n) : null;
  const roots = new Map((tree?.pathways ?? []).map(g => [g.id, g]));
  const rows = [];
  for (const [cid, s] of state) {
    const heading = headingAt(ids, 'characters', cid, n);
    if (!heading) continue;
    const m = meta.get(cid) ?? {};
    const ref = m.pathway ? refOf(m.pathway) ?? { id: m.pathway } : null;
    const g = ref ? roots.get(tree.rootOf(ref.id)) : null;
    rows.push({
      section: 'characters', id: cid, heading, name: latest(ids.get('characters', cid)?.name, n) ?? heading,
      title: m.title ?? null, status: m.status ?? null, joined: s.joined, left: s.active ? null : s.left,
      pathway: g ? { section: g.section, id: g.id, heading: g.heading } : null,
      sequence_number: m.sequence_number != null ? Number(m.sequence_number) : null,
    });
  }
  const notes = db.prepare(`SELECT value, ch FROM facts WHERE section = 'organizations' AND entity_id = ? AND field = 'members' AND ch <= ? ORDER BY ch DESC, ord`).all(id, n);
  return {
    section: 'organizations', id, ch: n,
    current: rows.filter(r => r.left == null).sort((a, b) => a.joined - b.joined || a.heading.localeCompare(b.heading)),
    former: rows.filter(r => r.left != null).sort((a, b) => b.left - a.left || a.heading.localeCompare(b.heading)),
    notes: linkRefs(identities(db, n), notes, n),
  };
}

// ---- /api/entity/:s/:id/facts ---------------------------------------------------------------

// One field of one entity, newest first, paged; `from`/`to` bound the chapters.
export function entityFacts(db, section, id, n, { field, from = 1, to = n, offset = 0, limit = 25 } = {}) {
  if (!field) throw new ApiError(400, 'field is required');
  const loaded = loadEntity(db, section, id, n);
  if (!loaded) return null;
  const hi = Math.min(to, n);
  const list = (loaded.facts[field] ?? []).filter(f => f.ch >= from && f.ch <= hi).reverse();
  return { section, id, field, ch: n, total: list.length, offset, limit, facts: linkRefs(identities(db, n), list.slice(offset, offset + limit), n) };
}

// ---- /api/entity/:s/:id/chapter/:c ----------------------------------------------------------

// What one chapter (c ≤ n) recorded about an entity. A chapter that only names it (`mentions`,
// n_facts 0) is an appearance too: it answers with no facts and `mentioned: true`.
export function entityChapter(db, section, id, c, n) {
  if (!SECTION_BY_KEY[section]) throw new ApiError(404, 'unknown section');
  if (c > n) return null;
  const rows = db.prepare('SELECT field, value, ch, op FROM facts WHERE section = ? AND entity_id = ? AND ch = ? ORDER BY ord').all(section, id, c);
  const mentioned = !rows.length && !!db.prepare('SELECT 1 FROM entity_chapters WHERE section = ? AND id = ? AND ch = ?').get(section, id, c);
  if (!rows.length && !mentioned) return null;
  const facts = {};
  for (const r of rows) (facts[r.field] ??= []).push(fact(r));
  const chapter = db.prepare('SELECT n, title, headline FROM chapters WHERE n = ?').get(c);
  const ids = identities(db, n);
  ids.prefetch(refKeysOf(rows));
  for (const [field, list] of Object.entries(facts)) facts[field] = linkRefs(ids, list, n);
  return { section, id, heading: headingAt(ids, section, id, n) ?? id, chapter: { n: chapter.n, title: chapter.title, headline: chapter.headline || null }, facts, ...(mentioned ? { mentioned } : {}) };
}

// ---- /api/since -----------------------------------------------------------------------------

const TRACKED_CHANGES = ['name', 'true_name', 'title', 'kind', 'role', 'status', 'importance', 'parent', 'base'];

// What changed in chapters (from, n]: new entities, identity/status changes of older entities,
// and headlines. Long lists are capped at `limit`; totals say how many there were.
export function since(db, from, n, { limit = 100 } = {}) {
  const a = Math.max(0, Math.min(from, n));
  // entities first seen in (a, n], with their latest importance through n (one indexed lookup each)
  const firsts = db.prepare('SELECT section, id, MIN(ch) first FROM entity_chapters WHERE ch <= ? GROUP BY section, id HAVING MIN(ch) > ?').all(n, a);
  const importance = new Map();
  if (firsts.length) {
    for (const r of db.prepare(`SELECT json_extract(j.value, '$[0]') section, json_extract(j.value, '$[1]') id, (
        SELECT x.value FROM facts x WHERE x.section = json_extract(j.value, '$[0]') AND x.entity_id = json_extract(j.value, '$[1]')
          AND x.field = 'importance' AND x.ch <= ? ORDER BY x.ch DESC, x.ord DESC, x.id DESC LIMIT 1) value
        FROM json_each(?) j`).all(n, JSON.stringify(firsts.map(r => [r.section, r.id])))) {
      if (r.value != null) importance.set(`${r.section}:${r.id}`, r.value);
    }
  }

  const fresh = firsts
    .map(r => ({ section: r.section, id: r.id, importance: importance.get(`${r.section}:${r.id}`) ?? null, first_ch: r.first }))
    .sort((x, y) => rank(IMPORTANCE, x.importance) - rank(IMPORTANCE, y.importance) || x.first_ch - y.first_ch);
  // changes to entities that already existed at `from`
  const changes = db.prepare(`SELECT f.section, f.entity_id id, f.field, f.value, f.ch FROM facts f
      JOIN (SELECT section, id FROM entity_chapters GROUP BY section, id HAVING MIN(ch) <= ?) old
        ON old.section = f.section AND old.id = f.entity_id
      WHERE f.ch > ? AND f.ch <= ? AND f.field IN (${sqlList(TRACKED_CHANGES)}) ORDER BY f.ch DESC, f.ord`).all(a, a, n);
  const headlines = db.prepare(`SELECT section, entity_id id, value, ch FROM facts WHERE field = 'headline' AND ch > ? AND ch <= ? ORDER BY ch DESC, ord`).all(a, n);

  // headings only for what is returned
  const shown = [fresh, changes, headlines].map(list => list.slice(0, limit));
  const ids = identities(db, n).prefetch(shown.flat().map(r => `${r.section}:${r.id}`));
  const withHeading = (r) => ({ ...r, heading: headingAt(ids, r.section, r.id, n) });
  const chapterList = db.prepare('SELECT n, title, headline FROM chapters WHERE n > ? AND n <= ? ORDER BY n').all(a, n)
    .map(c => ({ n: c.n, title: c.title, headline: c.headline || null }));

  return {
    from: a, ch: n,
    chapters: chapterList,
    new_entities: { total: fresh.length, items: shown[0].map(withHeading) },
    changes: { total: changes.length, items: shown[1].map(withHeading) },
    headlines: { total: headlines.length, items: shown[2].map(withHeading) },
  };
}

// ---- /api/questions -------------------------------------------------------------------------

// Open questions in chapters (from, n], newest first.
export function questions(db, n, { from = 0, offset = 0, limit = 20 } = {}) {
  const total = db.prepare("SELECT COUNT(*) c FROM chapter_notes WHERE kind = 'open_question' AND ch > ? AND ch <= ?").get(from, n).c;
  const items = db.prepare(`SELECT value, ch FROM chapter_notes WHERE kind = 'open_question' AND ch > ? AND ch <= ?
    ORDER BY ch DESC, ord LIMIT ? OFFSET ?`).all(from, n, limit, offset);
  return { ch: n, from, total, offset, limit, items };
}

// ---- /api/search ----------------------------------------------------------------------------

// One result per entity. Entities whose name, alias or title matches come first; then entities
// matched in their facts, best match first. Matches are wrapped in \u0001 … \u0002.
export function searchEntities(db, query, n, { limit = 30 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const match = q.split(/\s+/).map(t => `"${t.replace(/"/g, '""')}"*`).join(' ');
  const lower = q.toLowerCase();
  const byKey = new Map();
  const names = db.prepare(`SELECT en.section, en.id, en.field, en.value, en.ch, highlight(names_fts, 0, char(1), char(2)) snippet, bm25(names_fts) score
      FROM names_fts JOIN entity_names en ON en.rowid = names_fts.rowid
      WHERE names_fts MATCH ? AND en.ch <= ? ORDER BY score LIMIT 200`).all(match, n);
  for (const r of names) {
    const k = `${r.section}:${r.id}`;
    const exact = r.value.toLowerCase() === lower ? 0 : 1;
    const prev = byKey.get(k);
    if (!prev || exact < prev.exact) byKey.set(k, { section: r.section, id: r.id, matched: 'name', field: r.field, ch: r.ch, snippet: r.snippet, hits: 0, exact, score: r.score });
  }
  const factsRows = db.prepare(`SELECT f.section, f.entity_id, f.field, f.ch, snippet(facts_fts, 0, char(1), char(2), '…', 18) snippet, bm25(facts_fts) score
      FROM facts_fts JOIN facts f ON f.id = facts_fts.rowid
      WHERE facts_fts MATCH ? AND f.ch <= ? ORDER BY score LIMIT 500`).all(match, n);
  for (const r of factsRows) {
    const k = `${r.section}:${r.entity_id}`;
    const hit = byKey.get(k);
    if (hit) { hit.hits++; continue; }
    byKey.set(k, { section: r.section, id: r.entity_id, matched: 'fact', field: r.field, ch: r.ch, snippet: r.snippet, hits: 1, exact: 2, score: r.score });
  }
  const ranked = [...byKey.values()].sort((x, y) => (x.matched === 'name' ? 0 : 1) - (y.matched === 'name' ? 0 : 1) || x.exact - y.exact || x.score - y.score).slice(0, limit);
  const ids = identities(db, n).prefetch(ranked.map(r => `${r.section}:${r.id}`));
  return ranked.map(r => ({
    section: r.section, id: r.id, heading: headingAt(ids, r.section, r.id, n) ?? r.id,
    matched: r.matched, field: r.field, ch: r.ch, snippet: r.snippet, hits: r.hits,
  }));
}
