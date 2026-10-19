// #/ — the reading chapter (design 5a): a case-file kicker and the title, the summary beside a
// ledger of what changed ("+" new or updated, "−" ended), the entities only named here as
// "Appearing" chips, the diary pages read in it, and its notes. Phones read summary → changes →
// appearing → notes.
import { esc, chapterTitle, roman, volumeParts } from '../util.js';
import { api } from '../api.js';
import { store, sectionTitle, sectionOf, fieldLabel } from '../store.js';
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
      <aside class="ov-notes" aria-label="Notes on this chapter">
        <h2>Foreshadowing</h2>${notesList(d.foreshadowing, 'None noted.')}
        <h2>Open questions</h2>${notesList(d.open_questions, 'None noted.')}
        <p class="ov-links">${link('#/questions', `All open questions so far (${qs.total})`)} · ${link('#/since', 'What changed since you last read')}</p>
      </aside>
    </div>`,
  };
}
