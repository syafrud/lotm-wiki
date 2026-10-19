// #/about, #/report and #/reports.
import { $, esc } from '../util.js';
import { store } from '../store.js';
import { chip, link } from '../components/ui.js';
import { DISCLAIMER_HTML, showDisclaimer, resetDisclaimer } from '../components/modal.js';
import { STATIC, REPORTS } from '../mode.js';
import { sendReport, listReports } from '../components/reports.js';
import { fetchUpdates, noteHtml } from '../components/updates.js';

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
      <section class="about-updates" aria-labelledby="about-updates-h">
        <h2 id="about-updates-h">Updates</h2>
        <div id="about-updates"><p class="muted">Loading…</p></div>
      </section>`,
    mount(root) {
      $('#about-show-intro', root).addEventListener('click', () => { resetDisclaimer(); showDisclaimer(); });
      fetchUpdates().then((list) => {
        const box = $('#about-updates', root);
        if (!box) return;
        box.innerHTML = list.length
          ? `<ul class="update-list">${list.map(u => `<li><span class="update-date">${esc(u.date)}</span>${noteHtml(u.note)}</li>`).join('')}</ul>`
          : '<p class="empty">No updates recorded.</p>';
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
          await sendReport({
            ch: $('#report-ch', root).value,
            category: $('#report-category', root).value,
            where: $('#report-where', root).value,
            message: $('#report-message', root).value,
            contact: $('#report-contact', root).value,
            website: $('#report-website', root).value,
          });
          $('#report-message', root).value = '';
          status.innerHTML = `Thank you — your report was saved. ${link('#/reports', 'See the reports')}`;
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
export async function reports(params) {
  if (!REPORTS) return noReports('Reports');
  const all = await listReports(store.ch);
  // ?here=1: only those sent from the chapter being read; ?where=…: only those about one page
  const here = params.get('here') === '1';
  const about = params.get('where') ?? '';
  const list = all.filter(r => (!here || r.ch === store.ch) && (!about || r.where === about));
  const filter = params.get('g') ?? '';
  const listed = REPORT_CATEGORIES.filter(c => c.key !== 'spoiler');
  const shown = listed.filter(c => !filter || c.key === filter);
  const count = (key) => list.filter(r => r.category === key).length;
  const note = `Only reports sent by readers up to chapter ${store.ch} are shown, and reports marked as spoilers never are.`
    + (here ? ` Showing the ones from chapter ${store.ch}.` : '') + (about ? ` Showing the ones about “${esc(about)}”.` : '')
    + (here || about ? ` ${link('#/reports', 'Show all reports')}` : '');
  const reportsHash = (g) => {
    const q = new URLSearchParams();
    if (g) q.set('g', g);
    if (here) q.set('here', '1');
    if (about) q.set('where', about);
    return `#/reports${q.size ? `?${q}` : ''}`;
  };
  if (!list.length) {
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
            ${r.status === 'fixed' ? '<span class="tag new">fixed</span>' : ''}
            <span class="muted">${esc(when(r.at))}</span>
          </div>
          <p class="report-message">${esc(r.message)}</p>
        </div>`).join('')}</div>`;
  }).join('');
  return {
    title: 'Reports',
    html: `
      <h1 tabindex="-1">Reports</h1>
      <p class="subtitle">${list.length} report${list.length === 1 ? '' : 's'} from readers. Contact details are never shown here. ${note}</p>
      <nav class="filters" aria-label="Report categories">
        ${link(reportsHash(''), 'All', !filter ? 'active' : '', { current: !filter })}
        ${listed.map(c => link(reportsHash(c.key), `${esc(c.label)} <span class="count">${count(c.key)}</span>`, filter === c.key ? 'active' : '', { current: filter === c.key })).join('')}
      </nav>
      ${groups || '<p class="empty">Nothing in this category yet.</p>'}
      <p class="muted">${link('#/report', 'Send a report')}</p>`,
  };
}
