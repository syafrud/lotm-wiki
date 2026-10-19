// #/ — the reading chapter: headline, summary, notes, and one line per entity it introduced or
// updated, grouped by section. Wide screens put the notes beside the summary and the changes in
// columns; phones keep the order summary → changes → notes.
import { esc, chapterTitle } from '../util.js';
import { api } from '../api.js';
import { store, sectionTitle } from '../store.js';
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

export async function overview() {
  const n = store.ch;
  const [d, qs] = await Promise.all([
    api(`/api/chapter/${n}?ch=${n}&view=lines`),
    api(`/api/questions?ch=${n}&limit=1`),
  ]);
  const c = d.chapter;
  const paragraphs = String(c.summary ?? '').split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p>${esc(p)}</p>`).join('');
  const sections = d.sections.map(s => {
    const shown = s.items.slice(0, LINES_PER_SECTION);
    const rest = s.items.length - shown.length;
    return `<section class="changes">
      <h3>${esc(sectionTitle(s.key))} <span class="chip">${s.items.length}</span></h3>
      <ul class="change-list">${shown.map(e => `<li>
        <span class="change-name">${entityLink(s.key, e.id, e.heading)}${e.isNew ? ' <span class="chip new">new</span>' : ''}</span>
        ${e.line ? `<span class="change-line">${esc(e.line)}</span>` : ''}</li>`).join('')}</ul>
      ${rest > 0 ? `<p class="muted">${link(`#/s/${s.key}?sort=last`, `and ${rest} more in ${esc(sectionTitle(s.key))}`)}</p>` : ''}
    </section>`;
  }).join('');
  return {
    title: `Chapter ${c.n}: ${chapterTitle(c.title)}`,
    html: `<div class="overview-page">
      <header class="ov-head">
        <h1 class="chapter-title" tabindex="-1">Chapter ${c.n}: ${esc(chapterTitle(c.title))}</h1>
        <p class="subtitle">${esc(c.volume)} · showing everything known through this chapter</p>
        ${c.headline ? `<p class="lede">${esc(c.headline)}</p>` : ''}
      </header>
      <section class="ov-summary">
        <h2>Summary of events</h2>
        <div class="summary">${paragraphs || '<p class="empty">No summary.</p>'}</div>
        ${diaryBlock(d.diary ?? [])}
      </section>
      <aside class="ov-notes" aria-label="Notes on this chapter">
        <h2>Foreshadowing (this chapter)</h2>${notesList(d.foreshadowing, 'None noted.')}
        <h2>Open questions (this chapter)</h2>${notesList(d.open_questions, 'None noted.')}
        <p>${link('#/questions', `All open questions so far (${qs.total})`)} · ${link('#/since', 'What changed since you last read')}</p>
      </aside>
      <section class="ov-changes">
        <h2>Introduced or updated in this chapter</h2>
        <div class="ov-change-cols">${sections || '<p class="empty">Nothing recorded for this chapter.</p>'}</div>
      </section>
    </div>`,
  };
}
