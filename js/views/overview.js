// #/ — the reading chapter: headline, summary, notes, and one line per entity it introduced or
// updated, grouped by section.
import { esc } from '../util.js';
import { api } from '../api.js';
import { store, sectionTitle } from '../store.js';
import { entityLink, link, notesList } from '../components/ui.js';

const LINES_PER_SECTION = 12;

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
    title: `Chapter ${c.n}: ${c.title}`,
    html: `
      <h1 tabindex="-1">Chapter ${c.n}: ${esc(c.title)}</h1>
      <p class="subtitle">${esc(c.volume)} · showing everything known through this chapter</p>
      ${c.headline ? `<p class="lede">${esc(c.headline)}</p>` : ''}
      <h2>Summary of events</h2>
      <div class="summary">${paragraphs || '<p class="empty">No summary.</p>'}</div>
      <h2>Introduced or updated in this chapter</h2>
      ${sections || '<p class="empty">Nothing recorded for this chapter.</p>'}
      <h2>Foreshadowing (this chapter)</h2>${notesList(d.foreshadowing, 'None noted.')}
      <h2>Open questions (this chapter)</h2>${notesList(d.open_questions, 'None noted.')}
      <p>${link('#/questions', `All open questions so far (${qs.total})`)} · ${link('#/since', 'What changed since you last read')}</p>`,
  };
}
