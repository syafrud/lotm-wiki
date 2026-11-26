// #/me (PLAN R3): a signed-in reader's dashboard — where they are, what they read, their latest notes,
// the entries they opened last, and for an admin the reports waiting. #/notes: every note, by chapter.
// The wiki on this machine has no accounts: its dashboard is open to all, with a Guest / Admin switch
// (the admin view adds this machine's reports and the build; it changes nothing).
import { $, esc, roman, storage } from '../util.js';
import { api } from '../api.js';
import { STATIC } from '../mode.js';
import { store } from '../store.js';
import { link } from '../components/ui.js';
import { signedIn, accountEmail, signOut, isAdmin, adminReports } from '../components/account.js';
import { mountNotes } from '../components/notes.js';
import { readChapters, recentEntities } from '../components/progress.js';
import { STATUS } from '../components/reports.js';
import { readersBlock } from '../components/stats.js';

export function notesPage() {
  return {
    title: 'My notes',
    html: '<h1 tabindex="-1">My notes</h1><div id="notes-all"></div>',
    mount(root) { mountNotes($('#notes-all', root), { all: true, title: 'All my notes' }); },
  };
}

const ROLE = 'wiki.localRole';
const CATEGORIES = { misinformation: 'Wrong information', spoiler: 'Spoiler', missing: 'Missing information', design: 'Web design', other: 'Something else' };

// the admin's extra blocks on this machine: its reports (categories only, never a contact) and the build
async function localAdmin() {
  let reports = [], build = null;
  try { reports = (await api('/api/reports', { fresh: true })) ?? []; } catch {}
  try { build = await api('/api/build', { fresh: true }); } catch {}
  const count = (k) => reports.filter(r => r.category === k).length;
  return `${await readersBlock()}<section class="block"><h2>Reports on this machine</h2>
      <p>${reports.length} report${reports.length === 1 ? '' : 's'} (spoiler reports are not counted here).</p>
      <ul class="dash-counts">${Object.entries(CATEGORIES).filter(([k]) => k !== 'spoiler').map(([k, label]) => `<li>${esc(label)} <strong>${count(k)}</strong></li>`).join('')}</ul>
      <p>${link('#/reports', 'Open the reports')}</p></section>
    <section class="block"><h2>Wiki data</h2>
      <p>${store.chapters.length} chapters in the wiki, up to chapter ${store.chapters.at(-1)?.n ?? '?'}.${build?.id ? ` Build <code>${esc(build.id)}</code>.` : ''}</p></section>`;
}

export async function me(params = new URLSearchParams()) {
  if (STATIC && !signedIn()) {
    location.replace('#/account');
    return { title: 'Sign in', html: '' };
  }
  // this machine: ?as=admin|guest switches, and the choice is kept
  if (!STATIC && ['admin', 'guest'].includes(params.get('as'))) storage.set(ROLE, params.get('as'));
  const localRole = !STATIC ? (storage.get(ROLE) === 'admin' ? 'admin' : 'guest') : null;
  const ch = store.ch;
  const read = readChapters();
  // volumes the reader has reached; their full size is no spoiler (the shelf shows it too)
  const stats = (store.schema?.volumes ?? []).filter(v => v.first <= ch).map((v) => {
    const size = v.last - v.first + 1;
    const done = read.filter(n => n >= v.first && n <= v.last).length;
    return `<li><span class="dash-vol">${v.vol === 'side' ? 'Side Stories' : `Volume ${roman(Number(v.vol))}`}</span>
      <progress max="${size}" value="${done}" aria-label="Chapters read"></progress> <span class="muted">${done} / ${size}</span></li>`;
  }).join('');
  const recent = recentEntities().filter(e => e.ch <= ch).slice(0, 5);
  let reports = '';
  if (localRole === 'admin') reports = await localAdmin();
  else if (STATIC && isAdmin()) {
    try {
      const rows = await adminReports();
      const count = (s) => rows.filter(r => r.status === s).length;
      reports = `${await readersBlock()}<section class="block"><h2>Reports</h2>
        <ul class="dash-counts">${['unread', 'read', 'checked', 'in_progress'].map(s => `<li>${esc(STATUS[s])} <strong>${count(s)}</strong></li>`).join('')}</ul>
        <p>${link('#/admin', 'Open the reports dashboard')}</p></section>`;
    } catch { reports = '<section class="block"><h2>Reports</h2><p class="empty">The reports could not be loaded just now.</p></section>'; }
  }
  return {
    title: 'My dashboard',
    html: `<h1 tabindex="-1">My dashboard</h1>
      ${localRole ? `<nav class="filters dash-role" aria-label="View the dashboard as">
        ${link('#/me?as=guest', 'Guest', localRole === 'guest' ? 'active' : '', { current: localRole === 'guest' })}
        ${link('#/me?as=admin', 'Admin', localRole === 'admin' ? 'active' : '', { current: localRole === 'admin' })}
        <span class="muted">This machine's wiki has no accounts: switch to see each view.</span></nav>` : ''}
      <section class="block"><h2>Reading</h2>
        <p>You are at <strong>chapter ${ch}</strong>.</p>
        <p class="dash-actions"><a class="btn" href="#/read/${ch + 1}?ch=${ch}">Continue reading: chapter ${ch + 1}</a>
          ${link('#/', `Chapter ${ch} overview`, 'btn btn-outline')}</p></section>
      <section class="block"><h2>Chapters read</h2>
        ${stats && read.length ? `<ul class="dash-stats">${stats}</ul>` : '<p class="empty">No chapter marked as read yet.</p>'}
        <p class="muted">Counted in this browser when you press "I finished this chapter".</p></section>
      <div id="dash-notes"></div>
      <section class="block"><h2>Recently opened</h2>
        ${recent.length ? `<ul class="topic-list">${recent.map(e => `<li>${link(`#/e/${e.section}/${encodeURIComponent(e.id)}`, esc(e.heading))}</li>`).join('')}</ul>` : '<p class="empty">The entries you open appear here.</p>'}</section>
      ${reports}
      ${signedIn() ? `<section class="block"><h2>Account</h2>
        <p>Signed in as <strong>${esc(accountEmail() ?? 'you')}</strong>. Your chapter, settings and notes follow you to your other devices.</p>
        <p><button class="btn btn-quiet" type="button" id="account-signout">Sign out</button></p></section>` : ''}`,
    mount(root) {
      mountNotes($('#dash-notes', root), { all: true, limit: 5, title: 'Latest notes' });
      $('#account-signout', root)?.addEventListener('click', async () => { await signOut(); location.hash = '#/account'; });
    },
  };
}
