// #/questions — every open question so far, newest first, grouped by volume, paged.
// #/since?from=A — what changed in chapters (A, N] across the wiki ("Since you last read").
import { $, esc, enumLabel, chapterTitle } from '../util.js';
import { api } from '../api.js';
import { store, sectionTitle } from '../store.js';
import { chip, entityLink, link } from '../components/ui.js';
import { tabsHtml, initTabs } from '../components/tabs.js';
import { replaceQuery } from '../router.js';

const QUESTIONS_PAGE = 30;
const SINCE_DEFAULT = 10;

const volumeOf = (ch) => store.chapters.find(c => c.n === ch)?.volume ?? 'Earlier chapters';

// Questions grouped by volume (newest first), each group a heading and a list.
function questionsHtml(items) {
  const groups = [];
  for (const q of items) {
    const v = volumeOf(q.ch);
    if (groups.at(-1)?.volume !== v) groups.push({ volume: v, items: [] });
    groups.at(-1).items.push(q);
  }
  return groups.map(g => `<h2 class="vol-head">${esc(g.volume)}</h2><ul class="notes">${g.items.map(q => `<li>${esc(q.value)} ${chip(q.ch)}${q.answer
    ? `<p class="answer"><span class="answer-label">Answered</span> ${esc(q.answer.text)} ${chip(q.answer.ch)}</p>` : ''}</li>`).join('')}</ul>`).join('');
}

// #/questions (PLAN K5): newest · oldest still unanswered · answered (with the answer), each paged
const QUESTION_VIEWS = [
  { key: 'new', label: 'Newest', note: 'newest first; an answered one shows its answer' },
  { key: 'old', label: 'Oldest unanswered', note: 'not answered by your chapter, oldest first' },
  { key: 'answered', label: 'Answered', note: 'answered by your chapter, latest answer first' },
];
export async function questions(params) {
  const n = store.ch;
  const asked = params?.get('view');
  const active = QUESTION_VIEWS.some(v => v.key === asked) ? asked : 'new';
  const counts = Object.fromEntries(await Promise.all(QUESTION_VIEWS.map(async v => [v.key, (await api(`/api/questions?ch=${n}&view=${v.key}&limit=1`)).total])));
  return {
    title: 'Open questions',
    html: `
      <h1 tabindex="-1">Open questions</h1>
      <p class="subtitle">${counts.new} question${counts.new === 1 ? '' : 's'} raised through chapter ${n}. An answer shows only once you have read the chapter that gives it.</p>
      ${tabsHtml('qtabs', QUESTION_VIEWS.map(v => ({ key: v.key, label: v.label, count: counts[v.key] })), active, 'Open questions')}`,
    mount(root) {
      const select = initTabs(root, 'qtabs', async (key) => {
        replaceQuery({ view: key === 'new' ? null : key });
        const panel = $('#qtabs-panel', root);
        const view = QUESTION_VIEWS.find(v => v.key === key);
        const items = [];
        let total = 0;
        const load = async () => {
          const page = await api(`/api/questions?ch=${n}&view=${key}&offset=${items.length}&limit=${QUESTIONS_PAGE}`);
          items.push(...page.items);
          total = page.total;
          panel.innerHTML = `<p class="muted">${esc(view.note)}.</p>${questionsHtml(items) || `<p class="empty">${key === 'answered' ? 'None answered by this chapter yet.' : 'None yet.'}</p>`}
            ${total > items.length ? `<p><button type="button" class="btn btn-outline questions-more">Show more <span class="muted">(${total - items.length} left)</span></button></p>` : ''}`;
        };
        panel.onclick = async (ev) => {
          const button = ev.target.closest('.questions-more');
          if (!button) return;
          button.disabled = true;
          await load();
          panel.querySelector('.questions-more')?.focus();
        };
        await load();
      });
      select(active);
    },
  };
}

export async function since(params) {
  const n = store.ch;
  const asked = Number(params.get('from'));
  const from = Number.isInteger(asked) && asked >= 0 && asked < n ? asked
    : store.lastRead != null && store.lastRead < n ? store.lastRead : Math.max(0, n - SINCE_DEFAULT);
  const [d, qs] = await Promise.all([
    api(`/api/since?from=${from}&ch=${n}`),
    api(`/api/questions?ch=${n}&from=${from}&limit=20`),
  ]);
  const bySection = new Map();
  for (const e of d.new_entities.items) (bySection.get(e.section) ?? bySection.set(e.section, []).get(e.section)).push(e);
  const newHtml = [...bySection].map(([key, list]) => `<section class="changes"><h3>${esc(sectionTitle(key))} <span class="chip">${list.length}</span></h3>
    <ul class="change-list">${list.map(e => `<li><span class="change-name">${entityLink(e.section, e.id, e.heading)}</span> ${chip(e.first_ch)}</li>`).join('')}</ul></section>`).join('');
  const label = (f) => ({ status: 'Status', role: 'Role', importance: 'Importance', kind: 'Kind', name: 'Name', true_name: 'True name', title: 'Title', parent: 'Part of', base: 'Based in' }[f] ?? f);
  const value = (c) => ['status', 'role', 'importance', 'kind'].includes(c.field) ? enumLabel(c.value) : c.value.replace(/^[a-z_]+:/, '');
  const changesHtml = d.changes.items.map(c => `<li><span class="change-name">${entityLink(c.section, c.id, c.heading)}</span>
    <span class="change-line">${esc(label(c.field))}: ${esc(value(c))}</span> ${chip(c.ch)}</li>`).join('');
  const chaptersHtml = d.chapters.slice().reverse().map(c => `<li><a href="#/?ch=${c.n}">Chapter ${c.n}: ${esc(chapterTitle(c.title))}</a>${c.headline ? ` — ${esc(c.headline)}` : ''}</li>`).join('');
  const capped = (x) => x.total > x.items.length ? ` <span class="muted">(showing ${x.items.length} of ${x.total})</span>` : '';
  return {
    title: 'Since you last read',
    html: `
      <h1 tabindex="-1">Since you last read</h1>
      <p class="subtitle">Chapters ${from + 1}–${n}${store.lastRead === from ? ' · since the chapter you were on before your last jump' : ''}.
        ${from > 0 ? link(`#/since?from=${Math.max(0, from - 10)}`, 'Go 10 chapters further back') : ''}</p>
      <h2>Chapters <span class="chip">${d.chapters.length}</span></h2>
      <ul class="notes">${chaptersHtml}</ul>
      <h2>New <span class="chip">${d.new_entities.total}</span>${capped(d.new_entities)}</h2>
      ${newHtml || '<p class="empty">Nothing new.</p>'}
      <h2>Changed <span class="chip">${d.changes.total}</span>${capped(d.changes)}</h2>
      ${changesHtml ? `<ul class="change-list">${changesHtml}</ul>` : '<p class="empty">No names, titles or statuses changed.</p>'}
      <h2>New open questions <span class="chip">${qs.total}</span></h2>
      ${qs.items.length ? `<ul class="notes">${qs.items.map(q => `<li>${esc(q.value)} ${chip(q.ch)}</li>`).join('')}</ul>` : '<p class="empty">None.</p>'}
      ${qs.total > qs.items.length ? `<p>${link('#/questions', 'All open questions')}</p>` : ''}`,
  };
}
