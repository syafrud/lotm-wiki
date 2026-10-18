// The /api/* routes as a pure function, shared by the Node server (src/server.js) and the
// static site (web/public/js/static-api.js, PLAN B0): route(db, url) → { status, body, cache }.
// `cache` marks answers that depend only on the build and the URL (the server sends them with
// an ETag). No Node imports: `db` only needs prepare(sql).all/.get. Reader reports are not here —
// they need a server and stay in server.js.
import { SECTIONS, KINDS, GROUPS, SCALAR_FIELDS, IMPORTANCE, ROLES, STATUSES, CHARACTER_GROUPS, RECURRING_MIN_CHAPTERS, fieldLabel, enumLabel } from './lib/schema.js';
import { buildInfo, chapters, entity, chapterDelta } from './db-query.js';
import { meta, volume, counts, sectionRows, locations, entityOverview, entityFacts, entityChapter, chapterLines, since, questions, searchEntities } from './api-v2.js';

export function schemaPayload() {
  return {
    sections: SECTIONS.map(s => ({
      key: s.key, letter: s.letter, title: s.title, label: s.label,
      fields: s.fields.map(f => ({ key: f, label: fieldLabel(f) })),
      kinds: (KINDS[s.key] ?? []).map(k => ({ key: k, label: enumLabel(k) })),
      groups: GROUPS[s.key] ? [...GROUPS[s.key].groups.map(g => ({ key: g.key, title: g.title })), ...(GROUPS[s.key].split ? [{ key: GROUPS[s.key].split.key, title: GROUPS[s.key].split.title }] : [])] : [],
    })),
    scalarFields: SCALAR_FIELDS,
    characterGroups: { ...CHARACTER_GROUPS, recurringMinChapters: RECURRING_MIN_CHAPTERS },
    enums: { importance: IMPORTANCE, roles: ROLES, statuses: STATUSES },
  };
}

// Chapter list as seen from chapter n: titles (and slugs, which contain them) only up to n + 1,
// volume names only for volumes that have started. Numbers stay so the picker can offer them.
export function chaptersAt(list, n) {
  const started = new Set(list.filter(c => c.n <= n).map(c => c.volume));
  return list.map(c => ({
    n: c.n,
    slug: c.n <= n + 1 ? c.slug : null,
    title: c.n <= n + 1 ? c.title : null,
    volume: started.has(c.volume) ? c.volume : null,
  }));
}

const fail = (status, message) => Object.assign(new Error(message), { status });

// url: a URL whose pathname starts with /api/ (any origin).
export function route(db, url) {
  const maxCh = () => db.prepare('SELECT MAX(n) m FROM chapters').get().m ?? 0;
  const chOf = () => {
    const raw = url.searchParams.get('ch');
    const n = raw == null ? maxCh() : Number(raw);
    if (!Number.isInteger(n) || n < 0) throw fail(400, 'bad ch');
    return n;
  };
  // integer query parameter with bounds; absent → def
  const int = (name, def, { min = 0, max = Infinity } = {}) => {
    const raw = url.searchParams.get(name);
    if (raw == null || raw === '') return def;
    const v = Number(raw);
    if (!Number.isInteger(v) || v < min || v > max) throw fail(400, `bad ${name}`);
    return v;
  };
  const ok = (body) => ({ status: 200, body, cache: true });
  const plain = (status, body) => ({ status, body, cache: false });
  const missing = (what) => plain(404, { error: `no such ${what} (through this chapter)` });
  const unknown = () => plain(404, { error: 'unknown api route' });

  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('api'); // the static site may live under /<repo>/
  const [resource, a, b, c, d] = parts.slice(at + 1);
  try {
    if (resource === 'build') return plain(200, buildInfo(db));
    if (resource === 'chapters') {
      const list = chapters(db);
      return ok(url.searchParams.has('ch') ? chaptersAt(list, chOf()) : list);
    }
    if (resource === 'schema') return ok(schemaPayload());
    if (resource === 'meta') return ok(meta(db, chOf()));
    if (resource === 'counts') return ok(counts(db, chOf()));
    if (resource === 'volume' && a) {
      const v = /^\d+$/.test(a) ? volume(db, Number(a), chOf()) : null;
      return v ? ok(v) : missing('volume');
    }
    if (resource === 'chapter' && a) {
      const n = Number(a);
      if (!Number.isInteger(n) || n > chOf()) return missing('chapter');
      const delta = url.searchParams.get('view') === 'lines' ? chapterLines(db, n) : chapterDelta(db, n);
      return delta ? ok(delta) : missing('chapter');
    }
    if (resource === 'section' && a) {
      const view = url.searchParams.get('view') ?? 'list';
      return ok(sectionRows(db, a, chOf(), {
        imp: url.searchParams.get('imp') || null,
        sort: url.searchParams.get('sort') || 'importance',
        q: url.searchParams.get('q') ?? '',
        offset: int('offset', 0),
        limit: int('limit', 50, { min: 1, max: 200 }),
        view,
      }));
    }
    if (resource === 'entity' && a && b) {
      const id = decodeURIComponent(b);
      const n = chOf();
      if (c === 'facts') {
        const out = entityFacts(db, a, id, n, {
          field: url.searchParams.get('field'),
          from: int('from', 1), to: int('to', n),
          offset: int('offset', 0), limit: int('limit', 25, { min: 1, max: 100 }),
        });
        return out ? ok(out) : missing('entity');
      }
      if (c === 'chapter' && d) {
        const chapterN = Number(d);
        if (!Number.isInteger(chapterN) || chapterN < 1) return plain(400, { error: 'bad chapter' });
        const out = entityChapter(db, a, id, chapterN, n);
        return out ? ok(out) : missing('entity chapter');
      }
      if (c) return unknown();
      const out = url.searchParams.get('view') === 'overview'
        ? entityOverview(db, a, id, n, { since: url.searchParams.has('since') ? int('since', null, { min: 0 }) : null })
        : entity(db, a, id, n);
      return out ? ok(out) : missing('entity');
    }
    if (resource === 'since') {
      const n = chOf();
      return ok(since(db, int('from', 0), n, { limit: int('limit', 100, { min: 1, max: 500 }) }));
    }
    if (resource === 'questions') {
      return ok(questions(db, chOf(), { from: int('from', 0), offset: int('offset', 0), limit: int('limit', 20, { min: 1, max: 100 }) }));
    }
    if (resource === 'locations') return ok(locations(db, chOf()));
    if (resource === 'search') return ok(searchEntities(db, url.searchParams.get('q') ?? '', chOf(), { limit: int('limit', 30, { min: 1, max: 100 }) }));
    return unknown();
  } catch (err) {
    return plain(err.status ?? 500, { error: err.message });
  }
}
