// #/admin (PLAN L): the wiki owner works on the readers' reports. Only the static site with accounts
// has it. Everything a reader wrote is untrusted here, in the one page an admin's session is open:
// it all goes through esc().
import { $, esc } from '../util.js';
import { chip } from '../components/ui.js';
import { tabsHtml, initTabs } from '../components/tabs.js';
import { STATUS, FINISHED, reportImage, forgetReports } from '../components/reports.js';
import { fetchUpdates } from '../components/updates.js';
import { isAdmin, adminReports, updateReport, removeReportImage } from '../components/account.js';

const LABEL = { ...STATUS, hidden: 'Hidden' };
const SHORT = { unread: 'New', read: 'Read', checked: 'Checked', in_progress: 'Doing', done: 'Done', not_changed: 'No change', hidden: 'Hidden' };
const NO_CHANGE_REPLY = 'Thank you for checking this. We read your report and looked it up in the text, and the entry turned out to be correct, so it stays as it is.';

const reportHtml = (r, updates) => `
  <div class="report-item" data-id="${esc(r.id)}">
    <div class="report-meta">
      <span class="chip kind">${esc(r.category)}</span>
      ${chip(r.ch)}
      ${r.where_text ? `<span class="muted">${esc(r.where_text)}</span>` : ''}
      <span class="muted">${esc(new Date(r.created_at).toLocaleDateString())}</span>
    </div>
    <p class="report-message">${esc(r.message)}</p>
    ${r.image_path ? `<a href="${esc(reportImage(r.image_path))}" target="_blank" rel="noopener"><img class="report-image" src="${esc(reportImage(r.image_path))}" alt="Picture sent with this report" loading="lazy"></a>
      <p><button class="btn btn-quiet admin-image" type="button">Remove image</button></p>` : ''}
    ${r.credit ? `<p class="muted">Name to credit: ${esc(r.credit)}</p>` : ''}
    ${r.contact ? `<p class="muted">Contact (private): ${esc(r.contact)}</p>` : ''}
    <div class="admin-controls">
      <label for="admin-status-${esc(r.id)}">Status</label>
      <select id="admin-status-${esc(r.id)}" class="admin-status">
        ${Object.entries(LABEL).map(([k, label]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
      <div class="admin-update"${FINISHED.includes(r.status) ? '' : ' hidden'}>
        <label for="admin-update-${esc(r.id)}">The update that answers it</label>
        <select id="admin-update-${esc(r.id)}">
          <option value="">Choose an update</option>
          ${updates.map(u => `<option value="${esc(u.id)}"${u.id === r.update_id ? ' selected' : ''}>${esc(`${u.date}: ${u.note.slice(0, 60)}`)}</option>`).join('')}
        </select>
      </div>
      <label for="admin-reply-${esc(r.id)}">Public reply (optional)</label>
      <textarea id="admin-reply-${esc(r.id)}" class="admin-reply" rows="3" maxlength="500">${esc(r.reply)}</textarea>
      <div class="form-actions"><button class="btn admin-save" type="button">Save</button></div>
    </div>
  </div>`;

export async function admin() {
  if (!isAdmin()) {
    location.replace('#/reports');
    return { title: 'Reports', html: '' };
  }
  const [rows, updates] = await Promise.all([adminReports(), fetchUpdates()]);
  const count = (status) => rows.filter(r => r.status === status).length;
  return {
    title: 'Reports dashboard',
    html: `
      <h1 tabindex="-1">Reports dashboard</h1>
      <p class="subtitle">Every report from every chapter is shown here, so this page can contain spoilers.</p>
      <p class="form-status" id="admin-message" role="status"></p>
      ${tabsHtml('admin-tabs', Object.keys(LABEL).map(key => ({ key, label: LABEL[key], short: SHORT[key], count: count(key) })), 'unread', 'Reports by status')}`,
    mount(root) {
      const message = $('#admin-message', root);
      const say = (text, cls) => { message.textContent = text; message.className = `form-status ${cls}`; };
      let current = 'unread';
      const draw = (status, panel) => {
        current = status;
        const list = rows.filter(r => r.status === status);
        panel.innerHTML = list.length ? `<div class="reports">${list.map(r => reportHtml(r, updates)).join('')}</div>` : '<p class="empty">Nothing here.</p>';
        for (const box of panel.querySelectorAll('.report-item')) syncControls(box);
      };
      // Done and Checked, no change need an update: Save stays off until one is chosen
      const syncControls = (box) => {
        const finished = FINISHED.includes($('.admin-status', box).value);
        const update = $('.admin-update', box);
        update.hidden = !finished;
        $('.admin-save', box).disabled = finished && !$('select', update).value;
      };
      const select = initTabs(root, 'admin-tabs', draw);
      select('unread');
      const panel = $('#admin-tabs-panel', root);
      const redraw = () => {
        for (const key of Object.keys(LABEL)) $(`#admin-tabs-${key} .tab-count`, root).textContent = count(key);
        select(current);
      };
      panel.addEventListener('change', (ev) => {
        const box = ev.target.closest('.report-item');
        if (!box) return;
        const reply = $('.admin-reply', box);
        if (ev.target.matches('.admin-status') && ev.target.value === 'not_changed' && !reply.value.trim()) reply.value = NO_CHANGE_REPLY;
        syncControls(box);
      });
      panel.addEventListener('click', async (ev) => {
        const button = ev.target.closest('.admin-save, .admin-image');
        if (!button) return;
        const box = button.closest('.report-item');
        const r = rows.find(x => String(x.id) === box.dataset.id);
        button.disabled = true;
        try {
          if (button.matches('.admin-image')) {
            await removeReportImage(r.id, r.image_path);
            r.image_path = null;
            say(`Report ${r.id}: image removed.`, 'ok');
          } else {
            const status = $('.admin-status', box).value;
            const fields = { status, update_id: FINISHED.includes(status) ? $('.admin-update select', box).value : null, reply: $('.admin-reply', box).value.trim() };
            await updateReport(r.id, fields);
            Object.assign(r, fields);
            say(`Report ${r.id} saved: ${LABEL[status]}.`, 'ok');
          }
          forgetReports();
          redraw();
        } catch (err) {
          say(`Not saved: ${err.message}`, 'bad');
          button.disabled = false;
        }
      });
    },
  };
}
