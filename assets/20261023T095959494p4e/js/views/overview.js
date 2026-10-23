// #/ — the reading chapter (design 5a): a case-file kicker and the title, the summary beside a
// ledger of what changed ("+" new or updated, "−" ended), the entities only named here as
// "Appearing" chips, the diary pages read in it, and its notes. Phones read summary → changes →
// appearing → notes.
import { $, esc, chapterTitle, roman, volumeParts } from '../util.js';
import { REPORTS } from '../mode.js';
import { reportCounts } from '../components/reports.js';
import { api } from '../api.js';
import { store, sectionTitle, sectionOf, fieldLabel, shortTitle } from '../store.js';
import { entityLink, link, notesList, diaryEntryHtml } from '../components/ui.js';

const LINES_PER_SECTION = 12;

// "Diary pages in this chapter" (PLAN D1.6): the dated entries read here, per diary, word for word
function diaryBlock(entries) {
  if (!entries.length) return '';
  const byDiary = new Map();
  for (const e of entries) {
    const k = `${e.section}:${e.id}`;
    (byDiary.get(k) ?? byDiary.set(k, { ...e, list: [] }).get(k)).list.push(e);
  }
  return `<section class="ov-diary">
    <h2>Diary pages in this chapter</h2>
    ${[...byDiary.values()].map(d => `<div class="diary">
      <h3 class="diary-read">${entityLink(d.section, d.id, d.heading)} <span class="chip">${d.list.length}</span></h3>
      ${d.list.map(diaryEntryHtml).join('')}</div>`).join('')}
  </section>`;
}

const endedValue = (x) => (x.ref ? entityLink(x.ref.section, x.ref.id, x.ref.heading) : esc(x.value));

function changesLedger(d) {
  let plus = 0, minus = 0;
  const groups = d.sections.map(s => {
    const sec = sectionOf(s.key);
    const shown = s.items.slice(0, LINES_PER_SECTION);
    const rest = s.items.length - shown.length;
    const rows = shown.flatMap(e => {
      const out = [];
      plus++;
      out.push(`<li class="plus"><span class="sign" aria-label="added">+</span><span class="change-body">
        <span class="change-name">${entityLink(s.key, e.id, e.heading)}</span>${e.isNew ? ' <span class="tag new">enters the story</span>' : ''}
        ${e.line ? `<span class="change-line">${esc(e.line)}</span>` : ''}</span></li>`);
      if (e.ended) {
        minus++;
        out.push(`<li class="minus"><span class="sign" aria-label="ended">−</span><span class="change-body">
          <span class="change-name">${entityLink(s.key, e.id, e.heading)}</span> <span class="muted">no longer</span>
          <span class="change-line">${esc(fieldLabel(sec, e.ended.field))}: ${endedValue(e.ended)}</span></span></li>`);
      }
      return out;
    }).join('');
    return `<section class="changes">
      <h3>${esc(sectionTitle(s.key))} <span class="count-tag">${s.items.length}</span></h3>
      <ul class="change-list">${rows}</ul>
      ${rest > 0 ? `<p class="change-rest">${link(`#/s/${s.key}?sort=last`, `and ${rest} more in ${esc(sectionTitle(s.key))}`)}</p>` : ''}
    </section>`;
  }).join('');
  return { html: groups, plus, minus };
}

// ---- the portal under the chapter (PLAN B8.6): section shortcuts, pathways, the Tarot Club and one
// featured entry of this chapter; filled after the page shows, everything bounded by chapter n ----

async function portal(root, d, n) {
  const [counts, tree, tarot] = await Promise.all([
    api(`/api/counts?ch=${n}`).catch(() => null),
    api(`/api/pathways?ch=${n}`).catch(() => null),
    api(`/api/entity/organizations/tarot_club/members?ch=${n}`).catch(() => null), // 404 before it exists
  ]);
  if (store.ch !== n) return;
  const strip = $('#ov-shortcuts', root);
  if (strip && counts) {
    strip.innerHTML = counts.sections.filter(s => s.total).map(s => `<a class="shortcut" href="#/s/${s.key}?ch=${n}">
      <span class="shortcut-name">${esc(shortTitle(s.key))}</span><span class="shortcut-n">${s.total}${s.new ? ` <span class="new-text">+${s.new}</span>` : ''}</span></a>`).join('');
  }
  const box = $('#ov-portal', root);
  if (!box) return;
  const blocks = [];
  // featured: a major entry that changes in this chapter, the same one for everyone at this chapter
  const touched = d.sections.flatMap(s => s.items.map(e => ({ ...e, section: s.key })));
  const pool = touched.filter(e => e.importance === 'major').length ? touched.filter(e => e.importance === 'major') : touched.filter(e => e.importance === 'notable');
  const f = pool.length ? pool[n % pool.length] : null;
  if (f) {
    blocks.push(`<section class="portal-block portal-featured"><h2 class="kicker">Featured in this chapter</h2>
      <p class="featured-name">${entityLink(f.section, f.id, f.heading)}</p>
      ${f.line ? `<p class="featured-line">${esc(f.line)}</p>` : ''}
      <p class="muted">${esc(sectionTitle(f.section))} · ${link(`#/e/${f.section}/${encodeURIComponent(f.id)}`, 'Open the entry')}</p></section>`);
  }
  if (tarot?.current?.length) {
    blocks.push(`<section class="portal-block portal-tarot"><h2 class="kicker">The Tarot Club</h2>
      <ul class="tarot-grid">${tarot.current.map(m => `<li><a href="#/e/characters/${encodeURIComponent(m.id)}"><span class="tarot-code">${esc(m.title ?? '—')}</span><span class="tarot-name">${esc(m.name)}</span></a></li>`).join('')}</ul>
      <p class="muted">${link('#/e/organizations/tarot_club?tab=members', 'Members and former members')}</p></section>`);
  }
  if (tree?.pathways?.length) {
    blocks.push(`<section class="portal-block portal-pathways"><h2 class="kicker">Pathways known so far</h2>
      <ul class="pathway-grid">${tree.pathways.map(p => `<li><a href="#/e/${p.section}/${encodeURIComponent(p.id)}?tab=sequences">
        <span class="pathway-name">${esc(p.heading)}</span><span class="pathway-n">${p.sequences.length} of 10 Sequences known</span></a></li>`).join('')}</ul>
      <p class="muted">${link('#/pathways', 'All pathways and their Sequences')}</p></section>`);
  }
  box.innerHTML = blocks.join('');
}

export async function overview() {
  const n = store.ch;
  const [d, qs] = await Promise.all([
    api(`/api/chapter/${n}?ch=${n}&view=lines`),
    api(`/api/questions?ch=${n}&limit=1`),
  ]);
  const c = d.chapter;
  const vp = volumeParts(c.volume);
  const kicker = vp ? `Volume ${roman(vp.n)}${vp.name ? ` · ${esc(vp.name)}` : ''} · Chapter ${c.n}` : `Chapter ${c.n}`;
  const paragraphs = String(c.summary ?? '').split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p>${esc(p)}</p>`).join('');
  const changes = changesLedger(d);
  const appearing = d.appearing ?? [];
  return {
    title: `Chapter ${c.n}: ${chapterTitle(c.title)}`,
    html: `<div class="overview-page">
      <header class="ov-head">
        <span class="kicker">${kicker}</span>
        <h1 class="chapter-title" tabindex="-1"><span class="sr-only">Chapter ${c.n}: </span>${esc(chapterTitle(c.title))}</h1>
        ${c.headline ? `<p class="lede">${esc(c.headline)}</p>` : ''}
        <div id="ov-report-notice"></div>
      </header>
      <section class="ov-summary">
        <h2 class="sr-only">Summary of events</h2>
        <div class="summary prose">${paragraphs || '<p class="empty">No summary.</p>'}</div>
        ${diaryBlock(d.diary ?? [])}
      </section>
      <section class="ov-changes" aria-labelledby="ov-changes-h">
        <div class="ledger-head"><h2 id="ov-changes-h">Changes in this chapter</h2><span class="ledger-count">+${changes.plus}${changes.minus ? ` −${changes.minus}` : ''}</span></div>
        <div class="ov-change-cols">${changes.html || '<p class="empty">Nothing recorded for this chapter.</p>'}</div>
      </section>
      ${appearing.length ? `<section class="ov-appearing" aria-labelledby="ov-appearing-h">
        <h2 id="ov-appearing-h" class="kicker">Also appearing</h2>
        <div class="links">${appearing.map(a => `<span class="linkchip">${entityLink(a.section, a.id, a.heading)}</span>`).join('')}</div>
      </section>` : ''}
      <nav class="ov-shortcuts" id="ov-shortcuts" aria-label="Sections"></nav>
      <aside class="ov-notes" aria-label="Notes on this chapter">
        <h2>Foreshadowing</h2>${notesList(d.foreshadowing, 'None noted.')}
        <h2>Open questions</h2>${notesList(d.open_questions, 'None noted.')}
        <p class="ov-links">${link('#/questions', `All open questions so far (${qs.total})`)} · ${link('#/since', 'What changed since you last read')}</p>
      </aside>
      <section class="ov-portal" id="ov-portal" aria-label="The casebook"></section>
    </div>`,
    mount(root) {
      portal(root, d, n);
      // readers' reports sent from this chapter (never from later ones)
      if (!REPORTS) return;
      reportCounts(n).then(({ chapter }) => {
        const box = $('#ov-report-notice', root);
        if (!chapter || !box?.isConnected) return;
        box.outerHTML = `<p class="report-notice" role="note"><span class="kicker">Reader reports</span>
          <span>${chapter === 1 ? 'There is 1 report' : `There are ${chapter} reports`} from readers on this chapter.</span>
          ${link('#/reports?here=1', chapter === 1 ? 'Read it' : 'Read them')}</p>`;
      });
    },
  };
}
