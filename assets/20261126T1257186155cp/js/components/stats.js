// PLAN R4.2: reader statistics for the admin. Each browser is counted once a day, with whether it
// was signed in and whether it read (opened a chapter's reading page, finished one, or moved its
// chapter on). No address, no pages: the random id it keeps for "readers online". The static site
// counts in Supabase (scripts/supabase/community.sql), the wiki on this machine in /api/visit.
import { storage } from '../util.js';
import { api } from '../api.js';
import { STATIC, REPORTS_REMOTE } from '../mode.js';
import { signedIn, rpc } from './account.js';
import { visitorId } from './presence.js';

const LOGGED = 'wiki.visitLogged'; // "<day> <reader 0|1> <signed in 0|1>": what was sent today
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // Asia/Jakarta, as the database counts

// sends only when today's row would change: at most three times a day per browser
export function logVisit({ reader = false } = {}) {
  if (STATIC && !REPORTS_REMOTE) return;
  const [day, r, s] = (storage.get(LOGGED) ?? '').split(' ');
  const was = day === today() ? { r: r === '1', s: s === '1' } : null;
  const now = { r: reader || !!was?.r, s: signedIn() || !!was?.s };
  if (was && was.r === now.r && was.s === now.s) return;
  storage.set(LOGGED, `${today()} ${+now.r} ${+now.s}`);
  const sent = STATIC
    ? rpc('log_visit', { p_visitor: visitorId(), p_reader: now.r })
    : api('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitor: visitorId(), reader: now.r }) });
  sent.catch(() => {}); // a count is a nicety: never trouble the reader with it
}

const ROWS = [['visitors', 'Visitors'], ['signed_in', 'Signed in'], ['readers', 'Reading'], ['wiki_only', 'Only checked the wiki'], ['new', 'New']];
const COLS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']];

export const readersTable = (s) => `<table class="readers-table">
  <thead><tr><th scope="col"><span class="sr-only">Readers</span></th>${COLS.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
  <tbody>${ROWS.map(([k, l]) => `<tr><th scope="row">${l}</th>${COLS.map(([c]) => `<td>${Number(s?.[c]?.[k] ?? 0)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

// the admin's block (the database refuses the totals to anyone else)
export async function readersBlock() {
  let table;
  try { table = readersTable(STATIC ? await rpc('visit_stats') : await api('/api/visit-stats', { fresh: true })); }
  catch { table = '<p class="empty">The reader counts could not be loaded just now.</p>'; }
  return `<section class="block readers-stats"><h2>Readers</h2>${table}
    <p class="muted">Each browser counts once a day: "Reading" opened or finished a chapter's reading page or moved on a chapter; the rest only checked the wiki. No addresses or pages are kept.${STATIC ? '' : ' This machine has no accounts, so no one is signed in here.'}</p></section>`;
}
