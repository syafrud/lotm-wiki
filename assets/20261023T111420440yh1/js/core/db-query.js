// Read side of the wiki database: every query is bounded by the reading chapter n.
// No Node imports, so the same code runs in the browser for the static site (PLAN B0):
// `db` is anything with prepare(sql).all(...args) / .get(...args) — node:sqlite's DatabaseSync
// on the server, src/wasm-db.js (SQLite WebAssembly) in the browser.
import {
  SECTIONS, SECTION_BY_KEY, SCALAR_FIELDS, REMOVABLE_FIELDS, REF_FIELDS,
  headingOf, latest, metaOf, formerNames, firstChapter, groupEntities, parseRef, refSectionFor, withRemovals, currentCondition,
} from './lib/schema.js';

export function chapters(db) {
  return db.prepare('SELECT n, slug, title, volume FROM chapters ORDER BY n').all();
}

// rows: {section, entity_id, field, value, ch, ord, op} sorted -> [{id, facts:{field:[{value,ch[,op]}]}}]
export function groupFacts(rows) {
  const byEntity = new Map();
  for (const r of rows) {
    let e = byEntity.get(r.entity_id);
    if (!e) byEntity.set(r.entity_id, (e = { id: r.entity_id, facts: {} }));
    (e.facts[r.field] ??= []).push(r.op === 'remove' ? { value: r.value, ch: r.ch, op: 'remove' } : { value: r.value, ch: r.ch });
  }
  const section = SECTION_BY_KEY[rows[0]?.section];
  for (const e of byEntity.values()) {
    if (section) {
      const ordered = {};
      for (const f of section.fields) if (e.facts[f]) ordered[f] = e.facts[f];
      for (const f of Object.keys(e.facts)) if (!ordered[f]) ordered[f] = e.facts[f];
      e.facts = ordered;
    }
  }
  return [...byEntity.values()];
}

const IDENTITY_FIELDS = ['name', 'true_name', 'title', 'kind', 'importance', 'parent', 'base', 'sequence_number'];
const IDENTITY_IN = IDENTITY_FIELDS.map(f => `'${f}'`).join(', ');

// Identity facts (enough for headings, sorting and grouping) of entities through chapter n,
// loaded in batches: all() for everything, prefetch(keys) for a set of "section:id" keys.
// Each entity also gets _first = its first chapter overall.
export function identities(db, n) {
  const cache = new Map(); // "section:id" -> identity entity | null (unknown through n)
  let complete = false;
  const load = (rows, firsts, keys) => {
    const found = new Map();
    for (const r of rows) {
      const k = `${r.section}:${r.entity_id}`;
      let e = found.get(k);
      if (!e) found.set(k, (e = {}));
      (e[r.field] ??= []).push({ value: r.value, ch: r.ch });
    }
    for (const f of firsts) { const e = found.get(`${f.section}:${f.id}`); if (e) e._first = [{ value: '', ch: f.first }]; }
    for (const k of keys ?? found.keys()) cache.set(k, found.get(k) ?? null);
  };
  const ids = {
    all() {
      if (complete) return ids;
      load(
        db.prepare(`SELECT section, entity_id, field, value, ch FROM facts WHERE ch <= ? AND field IN (${IDENTITY_IN}) ORDER BY ch, ord`).all(n),
        db.prepare('SELECT section, id, MIN(ch) first FROM entity_chapters GROUP BY section, id').all(),
        null,
      );
      complete = true;
      return ids;
    },
    prefetch(keys) {
      if (complete) return ids;
      const want = [...new Set(keys)].filter(k => !cache.has(k));
      if (!want.length) return ids;
      const pairs = JSON.stringify(want.map(k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; }));
      load(
        db.prepare(`SELECT f.section, f.entity_id, f.field, f.value, f.ch FROM json_each(?) j
          JOIN facts f ON f.section = json_extract(j.value, '$[0]') AND f.entity_id = json_extract(j.value, '$[1]')
          WHERE f.ch <= ? AND f.field IN (${IDENTITY_IN}) ORDER BY f.ch, f.ord`).all(pairs, n),
        db.prepare(`SELECT ec.section, ec.id, MIN(ec.ch) first FROM json_each(?) j
          JOIN entity_chapters ec ON ec.section = json_extract(j.value, '$[0]') AND ec.id = json_extract(j.value, '$[1]')
          GROUP BY ec.section, ec.id`).all(pairs),
        want,
      );
      return ids;
    },
    get(section, id) {
      const k = `${section}:${id}`;
      if (!cache.has(k) && !complete) ids.prefetch([k]);
      return cache.get(k) ?? null;
    },
  };
  return ids;
}

// "section:id" keys of the references an entity makes (for prefetching).
export function refKeys(sectionKey, facts) {
  const out = [];
  for (const field of REF_FIELDS) {
    for (const f of facts[field] ?? []) {
      const r = parseRef(f.value, refSectionFor(field, sectionKey));
      if (r) out.push(`${r.section}:${r.id}`);
    }
  }
  return out;
}

// Resolver callback for headingOf/groupEntities: plain heading + entity, or null if unknown through n.
export function resolverAt(ids, n) {
  const cache = new Map();
  return (ref, defaultSection) => {
    const r = parseRef(ref, defaultSection);
    if (!r) return null;
    const key = `${r.section}:${r.id}`;
    if (cache.has(key)) return cache.get(key);
    const entity = ids.get(r.section, r.id);
    const out = entity ? { ...r, entity, heading: headingOf(r.section, r.id, entity, n, null, { plain: true }) } : null;
    cache.set(key, out);
    return out;
  };
}

// Chapter-bounded heading of any entity, or null when it is unknown through n.
export function headingAt(ids, section, id, n) {
  const entity = ids.get(section, id);
  return entity ? headingOf(section, id, entity, n) : null;
}

// Resolve reference facts ("section:id") to {section, id, heading}; unknown targets are dropped.
export function resolveRefs(ids, defaultSection, facts, n) {
  const out = [];
  for (const f of facts ?? []) {
    const r = parseRef(f.value, defaultSection);
    if (!r) continue;
    const heading = headingAt(ids, r.section, r.id, n);
    if (heading) out.push({ section: r.section, id: r.id, heading, ch: f.ch });
  }
  return out;
}

// Decorate a grouped entity with heading, meta and resolved references for chapter n.
export function decorate(ids, sectionKey, e, n, resolve = resolverAt(ids, n)) {
  ids.prefetch(refKeys(sectionKey, e.facts));
  // v4 removals: add facts carry `until`; references below use only what is still in force at n
  const active = {};
  for (const f of REMOVABLE_FIELDS) {
    if (!e.facts[f]) continue;
    const r = withRemovals(e.facts[f], n, f, sectionKey);
    e.facts[f] = r.all;
    active[f] = r.active;
  }
  e.heading = headingOf(sectionKey, e.id, e.facts, n, resolve);
  e.name = latest(e.facts.name, n) ?? e.id;
  e.meta = metaOf(e.facts, n);
  e.former_names = formerNames(e.facts, n).map(f => f.value);
  e.first_ch = firstChapter(e.facts);
  e.related = resolveRefs(ids, sectionKey, active.related, n).filter(r => !(r.section === sectionKey && r.id === e.id));
  e.affiliations = resolveRefs(ids, refSectionFor('affiliations', sectionKey), active.affiliations, n);
  const ended = (e.facts.affiliations ?? []).filter(f => f.until != null);
  if (ended.length) {
    e.former_affiliations = ended.flatMap(f => resolveRefs(ids, refSectionFor('affiliations', sectionKey), [f], n)
      .map(r => ({ ...r, until: f.until })));
  }
  if (e.facts.current_condition) e.current_condition = currentCondition(e.facts.current_condition, n);
  for (const f of ['parent', 'base', 'pathway']) {
    if (e.meta[f]) e[f] = resolveRefs(ids, refSectionFor(f, sectionKey), [{ value: e.meta[f], ch: 0 }], n)[0] ?? null;
  }
  return e;
}

// [first, last] chapter of the volume that chapter n belongs to.
export function volumeRangeAt(db, n) {
  const row = db.prepare('SELECT volume FROM chapters WHERE n = ?').get(n);
  if (!row) return { volume: null, start: n, end: n };
  const r = db.prepare('SELECT MIN(n) s, MAX(n) e FROM chapters WHERE volume = ?').get(row.volume);
  return { volume: row.volume, start: r.s, end: r.e };
}

export function groupsOf(sectionKey, ents, n, resolve, opts = {}) {
  return groupEntities(sectionKey, ents.map(e => ({ id: e.id, entity: e.facts, ref: e })), n, resolve, opts)
    .map(function strip(g) { return { key: g.key, title: g.title, entries: g.entries.map(x => ({ ...x.ref, heading: x.heading, depth: x.depth ?? 0, path: x.path ?? [] })), children: (g.children ?? []).map(strip) }; });
}

export function notesAt(db, where, args) {
  const notes = db.prepare(`SELECT ch, kind, value FROM chapter_notes WHERE ${where} ORDER BY ch, ord`).all(...args);
  return {
    foreshadowing: notes.filter(x => x.kind === 'foreshadowing').map(({ value, ch }) => ({ value, ch })),
    open_questions: notes.filter(x => x.kind === 'open_question').map(({ value, ch }) => ({ value, ch })),
  };
}

// One entity through chapter n, plus the same facts grouped per chapter for a timeline view.
export function entity(db, section, id, n) {
  const rows = db.prepare(`
    SELECT section, entity_id, field, value, ch, ord, op FROM facts
    WHERE section = ? AND entity_id = ? AND ch <= ? ORDER BY ch, ord`).all(section, id, n);
  if (!rows.length) return null;
  const [e] = groupFacts(rows);
  const ids = identities(db, n);
  decorate(ids, section, e, n);
  const timeline = {};
  for (const r of rows) ((timeline[r.ch] ??= {})[r.field] ??= []).push(r.op === 'remove' ? `Removed: ${r.value}` : r.value);
  const chs = db.prepare(`SELECT c.n, c.title FROM entity_chapters ec JOIN chapters c ON c.n = ec.ch
    WHERE ec.section = ? AND ec.id = ? AND ec.ch <= ? ORDER BY c.n`).all(section, id, n);
  // entities that point at this one (related / parent / base / affiliations / pathway)
  const sources = db.prepare('SELECT DISTINCT src_section, src_id FROM refs WHERE dst_section = ? AND dst_id = ? AND ch <= ?')
    .all(section, id, n).filter(r => !(r.src_section === section && r.src_id === id));
  ids.prefetch(sources.map(r => `${r.src_section}:${r.src_id}`));
  const backlinks = sources
    .map(r => ({ section: r.src_section, id: r.src_id, heading: headingAt(ids, r.src_section, r.src_id, n) }))
    .filter(r => r.heading);
  return { section, ...e, timeline: chs.map(c => ({ ch: c.n, title: c.title, facts: timeline[c.n] ?? {} })), backlinks };
}

// Only what chapter n itself introduced or updated.
export function chapterDelta(db, n) {
  const chapter = db.prepare('SELECT n, slug, title, volume, summary, headline FROM chapters WHERE n = ?').get(n);
  if (!chapter) return null;
  const sections = {};
  const groups = {};
  const q = db.prepare(`
    SELECT f.section, f.entity_id, f.field, f.value, f.ch, f.ord, f.op FROM facts f
    JOIN entities e ON e.section = f.section AND e.id = f.entity_id
    WHERE f.section = ? AND f.entity_id IN (SELECT DISTINCT entity_id FROM facts WHERE section = ? AND ch = ?) AND f.ch <= ?
    ORDER BY e.first_ch, e.rowid, f.ch, f.ord`);
  const firstOf = db.prepare('SELECT first_ch FROM entities WHERE section=? AND id=?');
  // identities of the entities in this chapter and of what they point at; anything else
  // (e.g. a parent organisation further up) is fetched on demand
  const bySection = SECTIONS.map(s => [s, groupFacts(q.all(s.key, s.key, n, n))]);
  const ids = identities(db, n).prefetch(bySection.flatMap(([s, ents]) => ents.flatMap(e => [`${s.key}:${e.id}`, ...refKeys(s.key, e.facts)])));
  const resolve = resolverAt(ids, n);
  const vr = volumeRangeAt(db, n);
  for (const [s, raw] of bySection) {
    const ents = raw.map(e => decorate(ids, s.key, e, n, resolve));
    // keep only this chapter's facts (scalars stay for identity)
    for (const e of ents) {
      for (const [field, list] of Object.entries(e.facts)) {
        if (SCALAR_FIELDS.includes(field)) continue;
        const mine = list.filter(f => f.ch === n);
        if (mine.length) e.facts[field] = mine; else delete e.facts[field];
      }
      e.isNew = firstOf.get(s.key, e.id)?.first_ch === n;
    }
    groups[s.key] = groupsOf(s.key, ents, n, resolve, { volumeStart: vr.start });
    sections[s.key] = ents;
  }
  return { chapter: { ...chapter, volume_start: vr.start, volume_end: vr.end }, sections, groups, ...notesAt(db, 'ch = ?', [n]) };
}


// Snippets mark matches with \u0001 … \u0002 (control characters cannot occur in the text),
// which the client turns into <mark> after escaping.
export function search(db, query, n, limit = 50) {
  const q = query.trim();
  if (!q) return [];
  // quote each term so punctuation in user input cannot break the FTS5 grammar
  const match = q.split(/\s+/).map(t => `"${t.replace(/"/g, '""')}"*`).join(' ');
  const rows = db.prepare(`
    SELECT f.section, f.entity_id, f.field, f.ch,
           snippet(facts_fts, 0, char(1), char(2), '…', 18) AS snippet
    FROM facts_fts JOIN facts f ON f.id = facts_fts.rowid
    WHERE facts_fts MATCH ? AND f.ch <= ?
    ORDER BY bm25(facts_fts) LIMIT ?`).all(match, n, limit);
  const ids = identities(db, n).prefetch(rows.map(r => `${r.section}:${r.entity_id}`));
  return rows.map(r => ({ section: r.section, id: r.entity_id, heading: headingAt(ids, r.section, r.entity_id, n) ?? r.entity_id, field: r.field, ch: r.ch, snippet: r.snippet }));
}

// The build this database came from (null for a database built before build ids existed).
export function buildInfo(db) {
  try { return db.prepare('SELECT id, built_at, chapters, facts, format FROM build').get() ?? null; } catch { return null; }
}
