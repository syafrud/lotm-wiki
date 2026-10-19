// Shape of a chapter "delta" object and how it is rendered to text.
// v3: scalar "latest wins" fields, chapter-bounded headings, grouping (characters per
// organisation via `affiliations`), Sequences living in the Pathways section.
// v4 (delta "format": 4, Volume 2 onwards): per-entity and per-chapter `headline`, facts that
// end (`op: "remove"`) in REMOVABLE_FIELDS, strict per-section status enums.

export const SERIES = 'LORD OF MYSTERIES';
export const WIDTH = 96;

// Entity sections, in render order A..J. `key` is the delta property, `label` the per-entity
// heading ("CHARACTER 1: Klein Moretti"), `fields` the canonical field order.
export const SECTIONS = [
  { letter: 'A', key: 'characters', title: 'CHARACTERS', label: 'CHARACTER',
    fields: ['name', 'true_name', 'title', 'aliases', 'kind', 'role', 'status', 'importance', 'headline', 'affiliations', 'titles', 'bio',
      'origin', 'origin_zhou_mingrui', 'origin_klein_moretti', 'physical_description', 'relationships_affiliations',
      'skills_knowledge', 'possessions', 'current_condition', 'history', 'notes', 'related'] },
  { letter: 'B', key: 'organizations', title: 'ORGANIZATIONS & FACTIONS', label: 'ORGANIZATION',
    fields: ['name', 'title', 'aliases', 'kind', 'importance', 'headline', 'parent', 'base', 'type', 'description', 'members', 'history', 'notes', 'related'] },
  { letter: 'C', key: 'locations', title: 'LOCATIONS', label: 'LOCATION',
    fields: ['name', 'aliases', 'kind', 'importance', 'headline', 'parent', 'type', 'region_country', 'description', 'notable_features',
      'inhabitants_affiliations', 'events_here', 'history', 'notes', 'related'] },
  { letter: 'D', key: 'items_artifacts', title: 'ITEMS & SEALED ARTIFACTS', label: 'ITEM',
    fields: ['name', 'aliases', 'kind', 'importance', 'headline', 'classification', 'description', 'appearance', 'abilities_effects',
      'ownership_custody', 'origin', 'history', 'notes', 'related'] },
  { letter: 'E', key: 'pathways_sequences', title: 'PATHWAYS, SEQUENCES & POTIONS', label: 'PATHWAY / SEQUENCE',
    fields: ['name', 'aliases', 'kind', 'importance', 'headline', 'pathway', 'sequence_number', 'description', 'potion_formula', 'ingredients',
      'abilities', 'characteristics', 'known_beyonders', 'sequences', 'potions', 'notes', 'related'] },
  { letter: 'F', key: 'rituals_abilities', title: 'RITUALS & MYSTICAL PHENOMENA', label: 'RITUAL / PHENOMENON',
    fields: ['name', 'aliases', 'kind', 'importance', 'headline', 'type', 'description', 'purpose', 'requirements_materials', 'procedure', 'effects',
      'practitioners', 'notes', 'related'] },
  { letter: 'G', key: 'creatures_entities', title: 'CREATURES & ENTITIES', label: 'CREATURE',
    fields: ['name', 'true_name', 'title', 'aliases', 'kind', 'status', 'importance', 'headline', 'type', 'description', 'abilities', 'notes', 'related'] },
  { letter: 'H', key: 'terminology', title: 'TERMINOLOGY & LANGUAGE', label: 'TERM',
    fields: ['name', 'aliases', 'kind', 'importance', 'headline', 'category', 'definition', 'usage_context', 'notes', 'related'] },
  { letter: 'I', key: 'world_lore', title: 'WORLD & LORE', label: 'TOPIC',
    fields: ['name', 'aliases', 'kind', 'importance', 'headline', 'category', 'details', 'implications', 'notes', 'related'] },
  { letter: 'J', key: 'timeline_dates', title: 'TIMELINE & DATES', label: 'ENTRY',
    fields: ['name', 'kind', 'importance', 'headline', 'when', 'date', 'event', 'significance', 'notes', 'related'] },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

// Non-entity parts of a delta.
export const SUMMARY_KEY = 'events_summary';   // string: section K
export const NOTE_KEYS = ['foreshadowing', 'open_questions']; // [{value, ch}]: section L
export const META_KEYS = ['chapter', 'title', 'volume'];
// ["section:id", …] existing entities that appear or are named in the chapter without new facts
// (format 4 addition): they count as appearances (entity_chapters, n_facts 0), never as facts.
export const MENTIONS_KEY = 'mentions';
// Current delta format. Deltas without "format" are v3 (Volume 1).
export const FORMAT = 4;
// One-sentence summaries: "headline" on an entity (per chapter) and at the top level (the chapter).
export const HEADLINE_KEY = 'headline';
export const HEADLINE_MAX = 140;

// Concrete fields most often left empty in Volume 2 (PLAN v3 A1.2), named in the extraction and
// top-up prompts so density comes from facts rather than `notes`.
export const OFTEN_EMPTY_FIELDS = {
  characters: ['history', 'skills_knowledge', 'possessions', 'current_condition', 'relationships_affiliations'],
  locations: ['events_here', 'notable_features'],
  items_artifacts: ['abilities_effects', 'ownership_custody'],
  pathways_sequences: ['abilities', 'ingredients', 'known_beyonders'],
};
export const oftenEmptyText = () => Object.entries(OFTEN_EMPTY_FIELDS).map(([s, fs]) => `${s}: ${fs.map(f => `\`${f}\``).join(', ')}`).join('; ');

// Fields whose facts are read as "the latest value known through chapter N".
export const SCALAR_FIELDS = ['name', 'true_name', 'title', 'kind', 'importance', 'role', 'status', 'parent', 'base', 'pathway', 'sequence_number', 'when'];

// Fields whose values are entity references "section:id" (multi-valued ones listed too).
export const REF_FIELDS = ['related', 'parent', 'base', 'affiliations', 'pathway'];

// Default section a bare id in a reference field points to.
export const REF_DEFAULT_SECTION = {
  parent: { organizations: 'organizations', locations: 'locations' },
  base: { organizations: 'locations' },
  affiliations: { characters: 'organizations' },
  pathway: { pathways_sequences: 'pathways_sequences' },
};

export function refSectionFor(field, sectionKey) {
  return REF_DEFAULT_SECTION[field]?.[sectionKey] ?? sectionKey;
}

export const IMPORTANCE = ['major', 'notable', 'minor'];
export const ROLES = ['protagonist', 'major', 'supporting', 'minor', 'mentioned'];
// Status enum per section (v4). STATUSES is the characters list, kept for older callers.
export const STATUSES_BY_SECTION = {
  characters: ['alive', 'dead', 'missing', 'unknown', 'not_applicable'],
  creatures_entities: ['alive', 'dead', 'missing', 'destroyed', 'sealed', 'unknown', 'not_applicable'],
};
export const STATUSES = STATUSES_BY_SECTION.characters;

// List fields whose facts can end: {"value": ..., "ch": N, "op": "remove"} closes an earlier fact
// with the same value (references compared after resolving the default section).
export const REMOVABLE_FIELDS = ['affiliations', 'related', 'possessions', 'titles'];
export const OPS = ['add', 'remove'];

export const KINDS = {
  characters: ['human', 'deity', 'entity', 'animal'],
  organizations: ['church', 'state', 'beyonder', 'academic', 'business', 'noble_house', 'family', 'secret', 'historical', 'other'],
  locations: ['continent', 'nation', 'region', 'city', 'district', 'street', 'building', 'room', 'natural', 'mystical', 'historical', 'other'],
  items_artifacts: ['sealed_artifact', 'charm', 'mystical', 'beyonder_tool', 'ingredient', 'mark', 'document', 'weapon', 'currency', 'clothing', 'food', 'household', 'vehicle', 'other'],
  pathways_sequences: ['pathway', 'sequence', 'concept'],
  rituals_abilities: ['ritual', 'divination', 'phenomenon', 'other'],
  creatures_entities: ['creature', 'spirit', 'undead', 'construct', 'other'],
  terminology: ['language', 'mysticism', 'title', 'institution', 'unit', 'phrase', 'era', 'other'],
  world_lore: ['history', 'religion', 'mysticism', 'society', 'geography', 'other'],
  timeline_dates: ['story', 'personal', 'world', 'scheduled'],
};

// Short definitions shown to the extractor for the less obvious kinds.
export const KIND_HINTS = {
  items_artifacts: {
    sealed_artifact: 'an item the Churches classify and seal (numbered Sealed Artifacts)',
    charm: 'a consumable Beyonder-made charm/talisman with a one-off effect',
    mystical: 'any other extraordinary/supernatural item not (yet) known as a Sealed Artifact or charm',
    beyonder_tool: 'an ordinary object a Beyonder uses to channel an ability (tarot cards, a pendulum, a crystal ball)',
    ingredient: 'a potion ingredient or ritual material',
    mark: 'a mark, brand or trace left on a body or object by a mystical event',
  },
  pathways_sequences: {
    pathway: 'one of the twenty-two pathways as a whole',
    sequence: 'one Sequence of a pathway: its potion, formula, ingredients and the abilities it grants',
    concept: 'general concepts about the Sequence/potion system',
  },
  rituals_abilities: {
    ritual: 'a ritual with a procedure (rituals, prayers, ceremonies)',
    divination: 'a divination method',
    phenomenon: 'a mystical phenomenon or power not tied to a Sequence (e.g. the gray fog)',
  },
  timeline_dates: {
    story: 'events that happen on-page in the story',
    personal: "a character's past (backstory dates)",
    world: 'world history and eras before the story',
    scheduled: 'upcoming or planned events mentioned in the text',
  },
};

// How each section's entities are grouped when listed. `by` names the scalar field; `groups` map
// its values to a heading. Values not listed fall into the group with `rest: true`.
export const GROUPS = {
  // characters are grouped dynamically per organisation (see groupCharacters)
  organizations: {
    by: 'kind',
    groups: [
      { key: 'church', title: 'Churches & religion', values: ['church'] },
      { key: 'state', title: 'State & government', values: ['state'] },
      { key: 'beyonder', title: 'Beyonder organisations', values: ['beyonder'] },
      { key: 'academic', title: 'Academic', values: ['academic'] },
      { key: 'business', title: 'Business & shops', values: ['business'] },
      { key: 'noble_house', title: 'Noble houses & families', values: ['noble_house', 'family'] },
      { key: 'secret', title: 'Secret & criminal', values: ['secret'] },
      { key: 'historical', title: 'Historical', values: ['historical'] },
      { key: 'other', title: 'Other', values: ['other'], rest: true },
    ],
  },
  items_artifacts: {
    by: 'kind',
    groups: [
      { key: 'sealed', title: 'Sealed Artifacts', values: ['sealed_artifact'] },
      { key: 'charms', title: 'Charms', values: ['charm'] },
      { key: 'mystical', title: 'Mystical items', values: ['mystical'] },
      { key: 'tools', title: 'Beyonder tools', values: ['beyonder_tool'] },
      { key: 'ingredients', title: 'Ingredients & materials', values: ['ingredient'] },
      { key: 'marks', title: 'Marks & traces', values: ['mark'] },
      { key: 'documents', title: 'Documents & texts', values: ['document'] },
      { key: 'everyday', title: 'Everyday items', values: [], rest: true },
    ],
  },
  pathways_sequences: {
    by: 'kind',
    groups: [
      { key: 'pathways', title: 'Pathways', values: ['pathway'] },
      { key: 'sequences', title: 'Sequences & potions', values: ['sequence'], sort: 'sequence' },
      { key: 'concepts', title: 'Concepts', values: ['concept'], rest: true },
    ],
  },
  rituals_abilities: {
    by: 'kind',
    groups: [
      { key: 'rituals', title: 'Rituals', values: ['ritual'] },
      { key: 'divination', title: 'Divination', values: ['divination'] },
      { key: 'phenomena', title: 'Mystical phenomena', values: ['phenomenon'], rest: true },
    ],
  },
  terminology: {
    by: 'kind',
    groups: [
      { key: 'language', title: 'Languages', values: ['language'] },
      { key: 'mysticism', title: 'Mysticism & Beyonder terms', values: ['mysticism'] },
      { key: 'title', title: 'Titles & ranks', values: ['title'] },
      { key: 'institution', title: 'Laws & institutions', values: ['institution'] },
      { key: 'unit', title: 'Units & currency', values: ['unit'] },
      { key: 'phrase', title: 'Phrases & sayings', values: ['phrase'] },
      { key: 'era', title: 'Eras & calendar', values: ['era'] },
      { key: 'other', title: 'Other', values: ['other'], rest: true },
    ],
  },
  world_lore: {
    by: 'kind',
    groups: [
      { key: 'history', title: 'History', values: ['history'] },
      { key: 'religion', title: 'Religion & gods', values: ['religion'] },
      { key: 'mysticism', title: 'Mysticism', values: ['mysticism'] },
      { key: 'society', title: 'Society & politics', values: ['society'] },
      { key: 'geography', title: 'Geography & setting', values: ['geography'] },
      { key: 'other', title: 'Other', values: ['other'], rest: true },
    ],
  },
  timeline_dates: {
    by: 'kind',
    groups: [
      { key: 'story', title: 'Story events', values: ['story'], sort: 'chronological' },
      { key: 'personal', title: 'Personal history', values: ['personal'], sort: 'chronological' },
      { key: 'world', title: 'World history', values: ['world'], sort: 'chronological' },
      { key: 'scheduled', title: 'Upcoming & scheduled', values: ['scheduled'], rest: true, sort: 'chronological' },
    ],
  },
};

// Character grouping: one group per organisation (from `affiliations`), then the independents
// by role, then deities. Exported so the API can describe it.
export const RECURRING_MIN_CHAPTERS = 3;

export const CHARACTER_GROUPS = {
  important: { key: 'important', title: 'Important & recurring' },
  independent: { key: 'independent', title: 'Independent' },
  gods: { key: 'gods', title: 'Gods & entities', kinds: ['deity', 'entity'] },
  god: { key: 'god', title: 'God' },
};

const LABEL_OVERRIDES = {
  relationships_affiliations: 'Relationships & Affiliations',
  region_country: 'Region / Country',
  ownership_custody: 'Ownership & Custody',
  abilities_effects: 'Abilities & Effects',
  skills_knowledge: 'Skills & Knowledge',
  requirements_materials: 'Requirements & Materials',
  inhabitants_affiliations: 'Inhabitants & Affiliations',
  true_name: 'True Name',
  origin_zhou_mingrui: 'Origin — Zhou Mingrui (Earth)',
  origin_klein_moretti: 'Origin — Klein Moretti (before the suicide)',
  sequence_number: 'Sequence',
  when: 'When',
  potion_formula: 'Potion Formula',
  known_beyonders: 'Known Beyonders',
};

export function fieldLabel(field) {
  return LABEL_OVERRIDES[field] ?? field.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// "sealed_artifact" -> "Sealed artifact"
export function enumLabel(value) {
  const s = String(value ?? '').replace(/_/g, ' ');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Fields in canonical order first, then any extra fields the delta carries, in their own order.
export function orderedFields(section, entity) {
  const known = section.fields.filter(f => f in entity);
  const extra = Object.keys(entity).filter(f => !section.fields.includes(f));
  return [...known, ...extra];
}

// ---- reading scalar facts ---------------------------------------------------------------

// Latest fact (highest ch <= n; ties: last listed). Returns the fact or null.
export function latestFact(facts, n = Infinity) {
  let best = null;
  for (const f of facts ?? []) {
    if (f.ch > n) continue;
    if (!best || f.ch >= best.ch) best = f;
  }
  return best;
}

export function latest(facts, n = Infinity) {
  return latestFact(facts, n)?.value ?? null;
}

// Every earlier `name` value that has since been superseded (through chapter n).
export function formerNames(entity, n = Infinity) {
  const cur = latestFact(entity.name, n);
  if (!cur) return [];
  const seen = new Set();
  const out = [];
  for (const f of entity.name ?? []) {
    if (f.ch > n || f === cur || f.value === cur.value || seen.has(f.value)) continue;
    seen.add(f.value);
    out.push(f);
  }
  return out;
}

// Comparable key of a fact value in a removable field ("nighthawks" and "organizations:nighthawks"
// are the same affiliation).
export function valueKey(field, sectionKey, value) {
  if (!REF_FIELDS.includes(field)) return String(value);
  const r = parseRef(value, refSectionFor(field, sectionKey));
  return r ? `${r.section}:${r.id}` : String(value);
}

// Facts of a list field through chapter n with removals applied:
//   - every "add" fact, with `until` = the chapter of the first later removal (≤ n), if any
//   - "remove" facts are kept (flagged op: 'remove') so a chapter view can show them
// `active` holds only the add facts still in force at n.
export function withRemovals(facts, n = Infinity, field = null, sectionKey = null) {
  const list = (facts ?? []).filter(f => f.ch <= n);
  const removals = list.filter(f => f.op === 'remove');
  if (!removals.length) return { all: list, active: list.filter(f => f.op !== 'remove') };
  const key = (f) => valueKey(field, sectionKey, f.value);
  const all = list.map(f => {
    if (f.op === 'remove') return f;
    const end = removals.filter(r => key(r) === key(f) && r.ch > f.ch).reduce((m, r) => Math.min(m, r.ch), Infinity);
    return Number.isFinite(end) ? { ...f, until: end } : f;
  });
  return { all, active: all.filter(f => f.op !== 'remove' && f.until == null) };
}

// current_condition as displayed: only the facts of the latest chapter (≤ n) that has any.
export function currentCondition(facts, n = Infinity) {
  const list = (facts ?? []).filter(f => f.ch <= n);
  const last = list.reduce((m, f) => Math.max(m, f.ch), -Infinity);
  return list.filter(f => f.ch === last);
}

export function firstChapter(entity) {
  let min = Infinity;
  for (const facts of Object.values(entity)) for (const f of facts ?? []) if (f.ch < min) min = f.ch;
  return min;
}

// "characters:melissa_moretti" -> {section, id}; bare ids are resolved against `defaultSection`.
export function parseRef(ref, defaultSection) {
  const m = /^([a-z_]+):(.+)$/.exec(String(ref ?? ''));
  if (m && SECTION_BY_KEY[m[1]]) return { section: m[1], id: m[2] };
  return defaultSection ? { section: defaultSection, id: String(ref) } : null;
}

// The chapter-bounded identity line of an entity.
//   resolve(ref, defaultSection) -> { heading, entity } | null   (optional; used for suffixes)
//   plain: true skips the organisation "(parent)" / sequence "(Sequence N)" suffix
export function headingOf(sectionKey, id, entity, n = Infinity, resolve = null, { plain = false } = {}) {
  const name = latest(entity.name, n) ?? id;
  const trueName = latest(entity.true_name, n);
  const title = latest(entity.title, n);
  const kind = latest(entity.kind, n);
  if ((sectionKey === 'characters' || sectionKey === 'creatures_entities') && (kind === 'deity' || kind === 'entity')) {
    return `${trueName ?? '?'} / ${name}`;
  }
  let h = name;
  if (trueName && trueName !== name) h += ` (${trueName})`;
  if (title && title !== name) h += ` / ${title}`;
  if (plain) return h;
  if (sectionKey === 'organizations') {
    const parent = latest(entity.parent, n);
    const base = latest(entity.base, n);
    const owner = (parent && resolve?.(parent, 'organizations')?.heading) || (base && resolve?.(base, 'locations')?.heading);
    if (owner) h += ` (${owner})`;
  } else if (sectionKey === 'pathways_sequences' && kind === 'sequence') {
    const num = latest(entity.sequence_number, n);
    if (num != null && !/sequence/i.test(h)) h += ` (Sequence ${num})`;
  }
  return h;
}

// Snapshot of the scalar fields through chapter n.
export function metaOf(entity, n = Infinity) {
  const meta = {};
  for (const f of SCALAR_FIELDS) {
    const v = latest(entity[f], n);
    if (v != null) meta[f] = v;
  }
  return meta;
}

// ---- ordering and grouping ---------------------------------------------------------------

function rank(list, value) {
  const i = list.indexOf(value);
  return i === -1 ? list.length : i;
}

// Sort key: importance, then first appearance, then original order.
export function sortEntries(entries, n = Infinity) {
  return entries
    .map((e, i) => ({ e, i, imp: rank(IMPORTANCE, latest(e.entity.importance, n)), first: firstChapter(e.entity) }))
    .sort((a, b) => a.imp - b.imp || a.first - b.first || a.i - b.i)
    .map(x => x.e);
}

// Timeline: chronological by `when` ("YYYY-MM-DD.nn"; unknown parts "??" sort as zero), then importance.
function sortChronological(entries, n) {
  const key = (e) => { const w = latest(e.entity.when, n); return w ? String(w).replace(/\?/g, '0') : null; };
  return entries
    .map((e, i) => ({ e, i, when: key(e), imp: rank(IMPORTANCE, latest(e.entity.importance, n)), first: firstChapter(e.entity) }))
    .sort((a, b) => (a.when == null) - (b.when == null) || (a.when ?? '').localeCompare(b.when ?? '') || a.imp - b.imp || a.first - b.first || a.i - b.i)
    .map(x => x.e);
}

// Sequences: by pathway (heading), then descending sequence number (9 first), then importance.
function sortSequences(entries, n, resolve) {
  return entries
    .map((e, i) => ({
      e, i,
      pathway: (() => { const p = latest(e.entity.pathway, n); return p ? (resolve?.(p, 'pathways_sequences')?.heading ?? p) : ''; })(),
      num: Number(latest(e.entity.sequence_number, n) ?? 99),
      imp: rank(IMPORTANCE, latest(e.entity.importance, n)),
    }))
    .sort((a, b) => a.pathway.localeCompare(b.pathway) || b.num - a.num || a.imp - b.imp || a.i - b.i)
    .map(x => x.e);
}

// Distinct chapters (within [from, n]) in which an entity has facts.
export function chaptersOf(entity, n = Infinity, from = 0) {
  const set = new Set();
  for (const facts of Object.values(entity)) for (const f of facts ?? []) if (f.ch >= from && f.ch <= n) set.add(f.ch);
  return set;
}

// Characters: "Important & recurring" (computed within the current volume), then a tree
// organisation kind → root organisation → sub-organisations built from `affiliations` and the
// organisations' `parent` chain, then Independent (by role), then deities & entities.
// An entity may appear in several groups; members sit only in the organisation they name.
function groupCharacters(withHeading, n, resolve, { volumeStart = 0 } = {}) {
  const roleRank = (e) => rank(ROLES, latest(e.entity.role, n));
  const impRank = (e) => rank(IMPORTANCE, latest(e.entity.importance, n));
  const byRole = (list) => list
    .map((e, i) => ({ e, i, role: roleRank(e), imp: impRank(e), first: firstChapter(e.entity) }))
    .sort((a, b) => a.role - b.role || a.imp - b.imp || a.first - b.first || a.i - b.i)
    .map(x => x.e);

  const independent = [];
  const deities = [];
  const important = [];
  const nodes = new Map(); // "organizations:id" -> node | null

  const nodeFor = (ref) => {
    const r = parseRef(ref, 'organizations');
    const key = `${r.section}:${r.id}`;
    if (nodes.has(key)) return nodes.get(key);
    const target = resolve?.(key, 'organizations');
    if (!target) { nodes.set(key, null); return null; }
    const node = {
      key: `org:${r.id}`, id: r.id, title: target.heading,
      kind: latest(target.entity?.kind, n) ?? 'other',
      imp: rank(IMPORTANCE, latest(target.entity?.importance, n)),
      first: target.entity ? firstChapter(target.entity) : Infinity,
      parentRef: latest(target.entity?.parent, n),
      entries: [], children: [], parent: null,
    };
    nodes.set(key, node);
    if (node.parentRef) {
      const p = nodeFor(node.parentRef);
      if (p && p !== node) { node.parent = p; p.children.push(node); }
    }
    return node;
  };

  for (const e of withHeading) {
    const kind = latest(e.entity.kind, n);
    if (CHARACTER_GROUPS.gods.kinds.includes(kind)) {
      // a deity affiliated with its church sits in a "God" child of that church; otherwise in Gods & entities
      let placed = false;
      for (const ref of withRemovals(e.entity.affiliations, n, 'affiliations', 'characters').active.map(f => f.value)) {
        const node = nodeFor(ref);
        if (!node) continue;
        (node.gods ??= []).push(e);
        placed = true;
      }
      if (!placed) deities.push(e);
      continue;
    }
    const inVolume = chaptersOf(e.entity, n, volumeStart);
    const role = latest(e.entity.role, n);
    if (inVolume.size && (['protagonist', 'major'].includes(role) || inVolume.size >= RECURRING_MIN_CHAPTERS)) {
      important.push({ e, count: inVolume.size });
    }
    const refs = withRemovals(e.entity.affiliations, n, 'affiliations', 'characters').active.map(f => f.value);
    let placed = false;
    for (const ref of refs) {
      const node = nodeFor(ref);
      if (!node) continue;
      if (!node.entries.includes(e)) node.entries.push(e);
      placed = true;
    }
    if (!placed) independent.push(e);
  }

  // best member (lowest role/importance rank) anywhere in the subtree, for ordering organisations
  const best = (node) => {
    let b = Infinity;
    for (const e of node.entries) b = Math.min(b, roleRank(e) * 10 + impRank(e));
    for (const c of node.children) b = Math.min(b, best(c));
    return b;
  };
  const sortNodes = (list) => list.sort((a, b) => a.imp - b.imp || best(a) - best(b) || a.first - b.first || a.title.localeCompare(b.title));
  const toGroup = (node) => ({
    key: node.key, title: node.title, entries: byRole(node.entries),
    children: [
      ...(node.gods?.length ? [{ key: `${node.key}:god`, title: CHARACTER_GROUPS.god.title, entries: sortEntries(node.gods, n), children: [] }] : []),
      ...sortNodes(node.children).map(toGroup),
    ],
  });

  const out = [];
  if (important.length) {
    out.push({
      key: CHARACTER_GROUPS.important.key, title: CHARACTER_GROUPS.important.title,
      entries: important
        .map((x, i) => ({ ...x, i, role: roleRank(x.e), imp: impRank(x.e), first: firstChapter(x.e.entity) }))
        .sort((a, b) => a.role - b.role || a.imp - b.imp || b.count - a.count || a.first - b.first || a.i - b.i)
        .map(x => x.e),
    });
  }
  const roots = [...nodes.values()].filter(x => x && !x.parent);
  for (const g of GROUPS.organizations.groups) {
    const mine = roots.filter(r => g.values.includes(r.kind) || (g.rest && !GROUPS.organizations.groups.some(h => h.values.includes(r.kind))));
    const isChurch = g.key === 'church';
    if (!mine.length && !(isChurch && deities.length)) continue;
    const children = sortNodes(mine).map(toGroup);
    // unaffiliated deities head the Churches & religion group
    if (isChurch && deities.length) children.unshift({ key: CHARACTER_GROUPS.gods.key, title: CHARACTER_GROUPS.gods.title, entries: sortEntries(deities, n), children: [] });
    out.push({ key: `kind:${g.key}`, title: g.title, entries: [], children });
  }
  if (independent.length) out.push({ key: CHARACTER_GROUPS.independent.key, title: CHARACTER_GROUPS.independent.title, entries: byRole(independent) });
  return out;
}

// entries: [{id, entity}] -> [{key, title, entries:[{id, entity, heading}]}]  (empty groups omitted)
export function groupEntities(sectionKey, entries, n = Infinity, resolve = null, opts = {}) {
  const withHeading = entries.map(e => ({ ...e, heading: headingOf(sectionKey, e.id, e.entity, n, resolve) }));
  if (sectionKey === 'characters') return groupCharacters(withHeading, n, resolve, opts);
  if (sectionKey === 'locations') return [{ key: 'all', title: null, entries: locationTree(withHeading, n) }];
  if (sectionKey === 'pathways_sequences') return groupPathways(withHeading, n, resolve);
  const spec = GROUPS[sectionKey];
  if (!spec) return [{ key: 'all', title: null, entries: sortEntries(withHeading, n) }];
  const buckets = new Map(spec.groups.map(g => [g.key, []]));
  const restKey = spec.groups.find(g => g.rest)?.key ?? spec.groups.at(-1).key;
  for (const e of withHeading) {
    const v = latest(e.entity[spec.by], n);
    const g = spec.groups.find(g => g.values.includes(v));
    buckets.get(g ? g.key : restKey).push(e);
  }
  return spec.groups
    .map(g => ({ key: g.key, title: g.title, entries: g.sort === 'sequence' ? sortSequences(buckets.get(g.key), n, resolve) : g.sort === 'chronological' ? sortChronological(buckets.get(g.key), n) : sortEntries(buckets.get(g.key), n) }))
    .filter(g => g.entries.length);
}

// Pathways: one group per pathway. A Sequence belongs to its `pathway` ref; a Sequence 9 without a
// ref defines its own pathway (named after itself); other unplaced Sequences go to "Unknown pathway";
// concepts last. Inside a group: the pathway entity first, then Sequences 9 → 0.
function groupPathways(withHeading, n, resolve) {
  const groups = new Map(); // key -> { key, title, imp, first, entries }
  const concepts = [];
  const unknown = [];
  const groupFor = (key, title, imp, first) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, title, imp, first, head: null, seqs: [] }));
    return g;
  };
  const byId = new Map(withHeading.map(e => [e.id, e]));
  for (const e of withHeading) {
    const kind = latest(e.entity.kind, n);
    if (kind === 'pathway') {
      const g = groupFor(`path:${e.id}`, e.heading, rank(IMPORTANCE, latest(e.entity.importance, n)), firstChapter(e.entity));
      g.head = e;
    }
  }
  for (const e of withHeading) {
    const kind = latest(e.entity.kind, n);
    if (kind === 'pathway') continue;
    if (kind !== 'sequence') { concepts.push(e); continue; }
    const ref = latest(e.entity.pathway, n);
    const num = Number(latest(e.entity.sequence_number, n));
    if (ref) {
      const r = parseRef(ref, 'pathways_sequences');
      const target = byId.get(r.id) ?? (resolve?.(`${r.section}:${r.id}`, 'pathways_sequences') ? { id: r.id, heading: resolve(`${r.section}:${r.id}`, 'pathways_sequences').heading, entity: resolve(`${r.section}:${r.id}`, 'pathways_sequences').entity } : null);
      if (target) {
        const g = groupFor(`path:${r.id}`, target.heading, rank(IMPORTANCE, latest(target.entity.importance, n)), firstChapter(target.entity));
        g.seqs.push(e);
        continue;
      }
    }
    if (num === 9) {
      // a Sequence 9 without an explicit pathway names its own pathway
      const g = groupFor(`path:${e.id}`, headingOf('pathways_sequences', e.id, e.entity, n, null, { plain: true }), rank(IMPORTANCE, latest(e.entity.importance, n)), firstChapter(e.entity));
      g.seqs.push(e);
      continue;
    }
    unknown.push(e);
  }
  const out = [...groups.values()]
    .sort((a, b) => a.imp - b.imp || a.first - b.first || a.title.localeCompare(b.title))
    .map(g => ({ key: g.key, title: g.title, entries: [...(g.head ? [g.head] : []), ...sortSequences(g.seqs, n, resolve)] }));
  if (unknown.length) out.push({ key: 'path:unknown', title: 'Unknown pathway', entries: sortSequences(unknown, n, resolve) });
  if (concepts.length) out.push({ key: 'concepts', title: 'Concepts', entries: sortEntries(concepts, n) });
  return out.filter(g => g.entries.length);
}

// Depth-first order by `parent`; each entry gets `depth` and `path` (ancestor headings, root first).
export function locationTree(entries, n = Infinity) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const children = new Map();
  const roots = [];
  for (const e of entries) {
    const p = String(latest(e.entity.parent, n) ?? '').replace(/^locations:/, '');
    if (p && byId.has(p) && p !== e.id) (children.get(p) ?? children.set(p, []).get(p)).push(e);
    else roots.push(e);
  }
  const out = [];
  const walk = (list, depth, path) => {
    for (const e of sortEntries(list, n)) {
      const node = { ...e, depth, path };
      out.push(node);
      walk(children.get(e.id) ?? [], depth + 1, [...path, e.heading]);
    }
  };
  walk(roots, 0, []);
  return out;
}
