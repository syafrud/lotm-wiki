// #/pathways (PLAN B8.3) — every pathway known through the reading chapter with its ladder 9 → 1 (→ 0 once the story names it).
// A Sequence not known yet stays "not known at ch N"; lines whose pathway has no entry yet are named
// after their first known Sequence; Sequences not placed in a line are listed at the end.
import { esc } from '../util.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { entityLink } from '../components/ui.js';
import { ladderHtml, SEQUENCE_0_CH } from './entity-topics.js';

export async function pathwaysPage() {
  const t = await api(`/api/pathways?ch=${store.ch}`);
  const top = store.ch >= SEQUENCE_0_CH ? 0 : 1; // the highest Sequence the story has named
  const card = (g) => `<section class="pathway-card" id="pw-${esc(g.id)}">
      <h2>${entityLink(g.section, g.id, g.heading)} <span class="count-tag">${g.sequences.length} of ${10 - top}</span></h2>
      ${ladderHtml(g)}</section>`;
  const named = t.pathways.filter(g => g.kind === 'pathway');
  const lines = t.pathways.filter(g => g.kind === 'line');
  return {
    title: 'Pathways & Sequences',
    html: `<div class="pathways-page">
      <header class="section-head"><div>
        <span class="kicker">The Beyonder pathways</span>
        <h1 tabindex="-1">Pathways &amp; Sequences</h1>
        <p class="subtitle">${t.pathways.length} known through ch ${store.ch}, each from Sequence 9 (lowest) to Sequence ${top}. A pathway is named after its Sequence 9${top === 0 ? ', or its Sequence 0 once that is known' : ''}; names appear once the story gives them.</p>
      </div></header>
      ${named.length ? `<div class="pathway-cards">${named.map(card).join('')}</div>` : '<p class="empty">No pathway known yet.</p>'}
      ${lines.length ? `<h2 class="kicker pathway-group">Lines whose pathway has no entry yet</h2><div class="pathway-cards">${lines.map(card).join('')}</div>` : ''}
      ${t.unplaced.length ? `<h2 class="kicker pathway-group">Sequences not placed in a pathway yet</h2>
        <ul class="topic-list">${t.unplaced.map(s => `<li>${entityLink(s.section, s.id, s.heading)}</li>`).join('')}</ul>` : ''}
    </div>`,
  };
}
