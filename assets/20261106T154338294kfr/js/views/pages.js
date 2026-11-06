// #/about, #/updates/<id>, #/report and #/reports.
import { $, esc, storage } from '../util.js';
import { store } from '../store.js';
import { chip, link } from '../components/ui.js';
import { DISCLAIMER_HTML, showDisclaimer, resetDisclaimer } from '../components/modal.js';
import { STATIC, REPORTS, REPORTS_REMOTE, CAPTCHA_KEY } from '../mode.js';
import { sendReport, listReports, listHistory, reportImage, STATUS, FINISHED } from '../components/reports.js';
import { fetchUpdates, fetchUpdateDetails, noteHtml } from '../components/updates.js';
import { ACCOUNTS, PASSWORD_MIN, signedIn, accountEmail, signIn, signUp, signOut, saveSettings, mountCaptcha } from '../components/account.js';
import { mountNotes } from '../components/notes.js';

// A static site exported without a reports address has nowhere to send them.
const noReports = (title) => ({
  title,
  html: `<h1 tabindex="-1">${esc(title)}</h1>
    <p class="empty">Reports are not available in this read-only version of the wiki.</p>`,
});

// Kept in step with REPORT_CATEGORIES in src/server.js.
const REPORT_CATEGORIES = [
  { key: 'misinformation', label: 'Wrong information' },
  { key: 'spoiler', label: 'Potential spoiler' },
  { key: 'missing', label: 'Missing information' },
  { key: 'design', label: 'Web design suggestion' },
  { key: 'other', label: 'Something else' },
];

export function about() {
  return {
    title: 'About',
    html: `
      <h1 tabindex="-1">About this wiki</h1>
      ${DISCLAIMER_HTML}
      <p>Use <strong>Read up to</strong> in the top bar to choose your volume and chapter. Facts are tagged
      with the chapter they come from, and nothing from a later chapter is shown.</p>
      <p>Keyboard: <kbd>←</kbd> / <kbd>→</kbd> previous / next chapter, <kbd>/</kbd> search.</p>
      ${STATIC ? '<p class="muted">The wiki data is loaded once into your browser.</p>' : ''}
      ${!REPORTS ? '<p class="muted">Reports are off in this version of the wiki.</p>' : `<p>${link('#/report', 'Report an error or send a suggestion')}</p>`}
      <p><button class="btn btn-quiet" id="about-show-intro">Show the intro again</button></p>
      <section class="about-settings" aria-labelledby="about-settings-h">
        <h2 id="about-settings-h">Settings</h2>
        <p class="muted">Kept in this browser${ACCOUNTS ? `, and in your account when you are ${link('#/account', 'signed in')}` : ''}.</p>
        <div class="setting"><button type="button" class="switch" role="switch" id="set-arrows" aria-labelledby="set-arrows-l"></button>
          <span id="set-arrows-l"><kbd>←</kbd> / <kbd>→</kbd> change the chapter</span></div>
        <div class="setting"><button type="button" class="switch" role="switch" id="set-confirm" aria-labelledby="set-confirm-l"></button>
          <span id="set-confirm-l">Ask before jumping more than one chapter ahead</span></div>
      </section>
      <section class="about-updates" aria-labelledby="about-updates-h">
        <h2 id="about-updates-h">Updates</h2>
        <div id="about-updates"><p class="muted">Loading…</p></div>
      </section>`,
    mount(root) {
      $('#about-show-intro', root).addEventListener('click', () => { resetDisclaimer(); showDisclaimer(); });
      // both on unless turned off (PLAN K8)
      for (const [id, key] of [['#set-arrows', 'wiki.arrows'], ['#set-confirm', 'wiki.confirmJump']]) {
        const sw = $(id, root);
        sw.setAttribute('aria-checked', String(storage.get(key) !== 'off'));
        sw.addEventListener('click', () => {
          const on = sw.getAttribute('aria-checked') !== 'true';
          sw.setAttribute('aria-checked', String(on));
          if (on) storage.remove(key); else storage.set(key, 'off');
          saveSettings({ arrow_keys: storage.get('wiki.arrows') !== 'off', confirm_jump: storage.get('wiki.confirmJump') !== 'off' });
        });
      }
      fetchUpdates().then((list) => {
        const box = $('#about-updates', root);
        if (!box) return;
        box.innerHTML = list.length
          ? `<ul class="update-list">${list.map(u => `<li><span class="update-date">${esc(u.date)}</span>${noteHtml(u.note)}${u.more ? ` ${link(`#/updates/${encodeURIComponent(u.id)}`, 'See more')}` : ''}</li>`).join('')}</ul>`
          : '<p class="empty">No updates recorded.</p>';
      });
    },
  };
}

// #/account (PLAN K9): optional. Signed out: what an account is for and the sign-in form; signed in:
// the address, Sign out and every private note.
export function account() {
  if (!ACCOUNTS) {
    return { title: 'Account', html: '<h1 tabindex="-1">Account</h1><p class="empty">Accounts are only on the public wiki. Everything here is kept in this browser.</p>' };
  }
  const body = (root) => {
    const box = $('#account-body', root);
    $('h1', root).textContent = signedIn() ? 'My account & notes' : 'Sign in (optional)';
    if (!signedIn()) {
      box.innerHTML = `
        <p>You do not need an account: the wiki remembers your chapter and settings in this browser. Sign in only if you want them —
        and private notes — on your other devices too.</p>
        <p class="muted">The wiki keeps your email address, your chapter, your two settings and the notes you write — nothing else,
        and only you can read them. It sends no email, so a forgotten password cannot be reset from here: keep it in a password manager,
        and use a password you use nowhere else.</p>
        <form class="account-form" id="account-form" novalidate>
          <label class="sr-only" for="account-email">Email address</label>
          <input id="account-email" type="email" autocomplete="username" required placeholder="you@example.com" maxlength="254">
          <label class="sr-only" for="account-password">Password</label>
          <input id="account-password" type="password" autocomplete="current-password" required placeholder="Password (at least ${PASSWORD_MIN} characters)" maxlength="72">
          <div id="account-captcha"></div>
          <button class="btn btn-outline" type="submit" data-do="in">Sign in</button>
          <button class="btn btn-quiet" type="submit" data-do="up">Create account</button>
        </form>
        <p class="hint" id="account-status" aria-live="polite"></p>`;
      const captcha = mountCaptcha($('#account-captcha', box)).catch(() => null);
      $('#account-form', box).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const email = $('#account-email', box), password = $('#account-password', box), status = $('#account-status', box);
        const creating = ev.submitter?.dataset.do === 'up';
        if (!email.checkValidity() || !email.value.trim()) { status.textContent = 'Please enter an email address.'; email.focus(); return; }
        if (password.value.length < (creating ? PASSWORD_MIN : 1)) { status.textContent = `Please enter a password of at least ${PASSWORD_MIN} characters.`; password.focus(); return; }
        const check = await captcha;
        if (CAPTCHA_KEY && !check?.token()) { status.textContent = 'Please finish the check above the buttons first.'; return; }
        for (const b of ev.target.querySelectorAll('button')) b.disabled = true;
        try {
          await (creating ? signUp : signIn)(email.value, password.value, check?.token() ?? '');
          body(root);
        } catch (e) {
          status.textContent = e.status === 429 ? 'Too many tries just now; please wait a few minutes.' : e.status === 400 && !creating ? 'Wrong email or password.' : `That did not work: ${e.message}`;
          check?.reset();
          for (const b of ev.target.querySelectorAll('button')) b.disabled = false;
        }
      });
      return;
    }
    box.innerHTML = `
      <p>Signed in as <strong>${esc(accountEmail() ?? 'you')}</strong>. Your chapter and settings follow you to your other devices.</p>
      <p><button class="btn btn-quiet" type="button" id="account-signout">Sign out</button></p>
      <div id="account-notes"></div>`;
    $('#account-signout', box).addEventListener('click', async () => { await signOut(); body(root); });
    mountNotes($('#account-notes', box), { title: 'All my notes' });
  };
  return {
    title: signedIn() ? 'My account' : 'Sign in',
    html: `<h1 tabindex="-1">${signedIn() ? 'My account &amp; notes' : 'Sign in (optional)'}</h1><div id="account-body"></div>`,
    mount: body,
  };
}

// #/updates/<id>: one update's details. A line that names a chapter after the reading chapter
// ("ch 125", "ch 5 → ch 8") is a spoiler there: it stays hidden, only counted.
const chaptersIn = (line) => [...line.matchAll(/\bch\.?\s*(\d+)/gi)].map(m => Number(m[1]));
export function updateDetails(id) {
  return {
    title: 'Update',
    html: `<p class="kicker">${link('#/about', 'About')} · Updates</p><div id="update-details"><p class="muted">Loading…</p></div>`,
    mount(root) {
      fetchUpdates().then(async (list) => {
        const box = $('#update-details', root);
        const u = list.find(x => x.id === id);
        if (!box) return;
        if (!u) { box.innerHTML = '<h1 tabindex="-1">Update not found</h1>'; return; }
        const details = u.more ? await fetchUpdateDetails(u.build) : [];
        // "- " lines are items, a line ending in ":" heads the items below it, any other line is text
        const out = [];
        let hidden = 0, heading = null, items = [];
        const flush = () => {
          if (items.length) out.push(`${heading ? `<h2>${esc(heading.slice(0, -1))}</h2>` : ''}<ul class="topic-list">${items.join('')}</ul>`);
          heading = null; items = [];
        };
        for (const l of details) {
          if (!l.startsWith('- ')) { flush(); if (l.endsWith(':')) heading = l; else out.push(`<p>${esc(l)}</p>`); continue; }
          if (Math.max(0, ...chaptersIn(l)) > store.ch) { hidden++; continue; }
          items.push(`<li>${esc(l.slice(2))}</li>`);
        }
        flush();
        // the reports this update answers, from chapters already read; their text is not repeated here
        const answered = (await listHistory(store.ch).catch(() => [])).filter(r => r.update === id);
        const thanks = [...new Set(answered.filter(r => r.status === 'done').map(r => r.credit || 'a reader'))];
        const unchanged = answered.filter(r => r.status === 'not_changed').length;
        if (thanks.length) out.push(`<h2>Thanks to</h2><p class="update-thanks">${esc(thanks.join(', '))}</p>`);
        if (unchanged) out.push(`<h2>Checked, no change needed</h2><p class="update-unchanged">${unchanged} report${unchanged === 1 ? '' : 's'}, answered in the ${link('#/reports?view=history', 'report history')}.</p>`);
        box.innerHTML = `<h1 tabindex="-1">Update of ${esc(u.date)}</h1><p class="lede">${noteHtml(u.note)}</p>${out.join('')}
          ${hidden ? `<p class="muted">${hidden} more line${hidden === 1 ? '' : 's'} about chapters after ch ${store.ch} stay hidden until you read them.</p>` : ''}`;
      });
    },
  };
}

export function report(params) {
  if (!REPORTS) return noReports('Report an error');
  const where = params.get('from') ?? '';
  return {
    title: 'Report an error',
    html: `
      <h1 tabindex="-1">Report an error</h1>
      <p class="subtitle">Wrong fact, missing detail, spoiler that slipped through — tell us here.</p>
      <form class="report-form" id="report-form">
        <label for="report-ch">Chapter</label>
        <input id="report-ch" type="number" min="1" required value="${store.ch}">
        <label for="report-category">Category</label>
        <select id="report-category">
          ${REPORT_CATEGORIES.map(c => `<option value="${c.key}">${esc(c.label)}</option>`).join('')}
        </select>
        <label for="report-where">Where (page, entity, section)</label>
        <input id="report-where" type="text" maxlength="200" value="${esc(where)}" placeholder="e.g. Characters › Klein Moretti">
        <label for="report-message">What is wrong or missing<span class="req" aria-hidden="true">*</span></label>
        <textarea id="report-message" rows="6" maxlength="2000" required aria-required="true"></textarea>
        <label for="report-contact">Contact (optional)</label>
        <input id="report-contact" type="text" maxlength="200" placeholder="email or anything to reach you" aria-describedby="report-contact-hint">
        <p class="hint" id="report-contact-hint">Only used to follow up on your report. It is never shown publicly.</p>
        <label for="report-credit">Name to credit (optional)</label>
        <input id="report-credit" type="text" maxlength="80" aria-describedby="report-credit-hint">
        <p class="hint" id="report-credit-hint">Shown publicly if this report leads to a fix. Leave it empty to stay anonymous.</p>
        ${!REPORTS_REMOTE ? '' : `<label for="report-image">Picture (optional)</label>
        <input id="report-image" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="report-image-hint">
        <p class="hint" id="report-image-hint">Optional. Shown publicly after we read your report, so leave out anything from later chapters.</p>`}
        <div class="hp" aria-hidden="true"><label for="report-website">Leave this empty</label><input id="report-website" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="form-actions">
          <button class="btn" type="submit">Send report</button>
          <span class="form-status" id="report-status" role="status"></span>
        </div>
      </form>
      <p class="muted">${link('#/reports', 'See all reports')}</p>`,
    mount(root) {
      $('#report-form', root).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const status = $('#report-status', root);
        const button = $('#report-form button[type=submit]', root);
        status.textContent = 'Sending…';
        status.className = 'form-status';
        button.disabled = true;
        try {
          const sent = await sendReport({
            ch: $('#report-ch', root).value,
            category: $('#report-category', root).value,
            where: $('#report-where', root).value,
            message: $('#report-message', root).value,
            contact: $('#report-contact', root).value,
            credit: $('#report-credit', root).value,
            image: $('#report-image', root)?.files[0],
            website: $('#report-website', root).value,
          });
          $('#report-message', root).value = '';
          if ($('#report-image', root)) $('#report-image', root).value = '';
          status.innerHTML = `Thank you — your report was saved${sent?.imageFailed ? ', but the picture could not be sent' : ''}. ${link('#/reports', 'See the reports')}`;
          status.className = 'form-status ok';
        } catch (err) {
          status.textContent = err.message;
          status.className = 'form-status bad';
        } finally {
          button.disabled = false;
        }
      });
    },
  };
}

// Public list of what readers have reported, grouped by category (spoiler reports are never listed).
// Open: still being looked at. History (?view=history): finished, kept for good, each with its update.
export async function reports(params) {
  if (!REPORTS) return noReports('Reports');
  const [all, past] = await Promise.all([listReports(store.ch), listHistory(store.ch)]);
  // ?here=1: only those sent from the chapter being read; ?where=…: only those about one page
  const here = params.get('here') === '1';
  const about = params.get('where') ?? '';
  const scoped = (rows) => rows.filter(r => (!here || r.ch === store.ch) && (!about || r.where === about));
  const open = scoped(all).filter(r => !FINISHED.includes(r.status));
  const finished = scoped(past);
  const history = params.get('view') === 'history';
  const list = history ? finished : open;
  const filter = params.get('g') ?? '';
  const listed = REPORT_CATEGORIES.filter(c => c.key !== 'spoiler');
  const shown = listed.filter(c => !filter || c.key === filter);
  const count = (key) => list.filter(r => r.category === key).length;
  const note = `Only reports sent by readers up to chapter ${store.ch} are shown, and reports marked as spoilers never are.`
    + (here ? ` Showing the ones from chapter ${store.ch}.` : '') + (about ? ` Showing the ones about “${esc(about)}”.` : '')
    + (here || about ? ` ${link('#/reports', 'Show all reports')}` : '');
  const reportsHash = (g, inHistory = history) => {
    const q = new URLSearchParams();
    if (inHistory) q.set('view', 'history');
    if (g) q.set('g', g);
    if (here) q.set('here', '1');
    if (about) q.set('where', about);
    return `#/reports${q.size ? `?${q}` : ''}`;
  };
  if (!open.length && !finished.length) {
    return {
      title: 'Reports',
      html: `
        <h1 tabindex="-1">Reports</h1>
        <p class="subtitle">What readers have sent in so far. ${note}</p>
        <p class="empty">No reports yet. ${link('#/report', 'Be the first to send one')}.</p>`,
    };
  }
  const when = (at) => {
    const d = at ? new Date(at) : null;
    return d && !isNaN(d) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  };
  const groups = shown.map(c => {
    const items = list.filter(r => r.category === c.key);
    if (!items.length) return '';
    return `
      <h2>${esc(c.label)} <span class="count">${items.length}</span></h2>
      <div class="reports">${items.map(r => `
        <div class="report-item">
          <div class="report-meta">
            <span class="chip kind">${esc(c.label)}</span>
            ${r.ch != null ? chip(r.ch) : ''}
            ${r.where ? `<span class="muted">${esc(r.where)}</span>` : ''}
            ${STATUS[r.status] ? `<span class="tag${FINISHED.includes(r.status) ? ' new' : ''}">${esc(STATUS[r.status])}</span>` : ''}
            <span class="muted">${esc(when(r.at))}</span>
          </div>
          <p class="report-message">${esc(r.message)}</p>
          ${r.image ? `<a href="${esc(reportImage(r.image))}" target="_blank" rel="noopener"><img class="report-image" src="${esc(reportImage(r.image))}" alt="Picture sent with this report" loading="lazy"></a>` : ''}
          ${r.reply ? `<p class="report-reply">${esc(r.reply)}</p>` : ''}
          ${r.update ? `<p class="report-update">${link(`#/updates/${encodeURIComponent(r.update)}`, 'See more')}</p>` : ''}
        </div>`).join('')}</div>`;
  }).join('');
  return {
    title: 'Reports',
    html: `
      <h1 tabindex="-1">Reports</h1>
      <p class="subtitle">${list.length} report${list.length === 1 ? '' : 's'} from readers. Contact details are never shown here. ${note}</p>
      ${!REPORTS_REMOTE ? '' : `<nav class="filters" aria-label="Open or finished reports">
        ${link(reportsHash(filter, false), `Open <span class="count">${open.length}</span>`, !history ? 'active' : '', { current: !history })}
        ${link(reportsHash(filter, true), `History <span class="count">${finished.length}</span>`, history ? 'active' : '', { current: history })}
      </nav>`}
      <nav class="filters" aria-label="Report categories">
        ${link(reportsHash(''), 'All', !filter ? 'active' : '', { current: !filter })}
        ${listed.map(c => link(reportsHash(c.key), `${esc(c.label)} <span class="count">${count(c.key)}</span>`, filter === c.key ? 'active' : '', { current: filter === c.key })).join('')}
      </nav>
      ${groups || '<p class="empty">Nothing in this category yet.</p>'}
      <p class="muted">${link('#/report', 'Send a report')}</p>`,
  };
}
