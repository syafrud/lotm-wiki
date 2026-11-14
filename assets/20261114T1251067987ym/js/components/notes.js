// A signed-in reader's private notes (PLAN K9): on an entity's Overview (its notes) and on the account
// page (all of them). A note is kept with the chapter it was written at; one written further on than
// the reading chapter stays hidden (counted only), like everything else in the wiki.
import { $, esc } from '../util.js';
import { store } from '../store.js';
import { chip, entityLink } from './ui.js';
import { signedIn, listNotes, addNote, deleteNote } from './account.js';

export async function mountNotes(box, { section = null, id = null, title = 'My notes' } = {}) {
  if (!box || !signedIn()) return;
  const draw = async (status = '') => {
    let notes = [];
    let failed = '';
    try { notes = (await listNotes({ section, id })) ?? []; } catch (e) { failed = e.message; }
    const shown = notes.filter(n => n.ch <= store.ch);
    const later = notes.length - shown.length;
    box.innerHTML = `<section class="block note-box my-notes" aria-labelledby="my-notes-h">
      <h2 id="my-notes-h">${esc(title)}</h2><p class="muted">Only you can see these.</p>
      ${failed ? `<p class="empty">${esc(failed)}</p>` : ''}
      ${shown.map(n => `<div class="note-row" data-id="${Number(n.id)}"><div><p class="note-text">${esc(n.text)}</p>
        <span>${chip(n.ch)}${!id && n.section && n.entity_id ? ` ${entityLink(n.section, n.entity_id, n.entity_id.replace(/_/g, ' '))}` : ''}</span></div>
        <button type="button" class="btn btn-quiet note-del">Delete</button></div>`).join('') || (failed ? '' : '<p class="empty">No notes yet.</p>')}
      ${later ? `<p class="muted">${later} note${later === 1 ? '' : 's'} written at a later chapter stay${later === 1 ? 's' : ''} hidden until you get there.</p>` : ''}
      <label class="sr-only" for="note-new">New note</label>
      <textarea id="note-new" maxlength="2000" placeholder="A note for yourself, kept at ch ${store.ch}"></textarea>
      <p><button type="button" class="btn btn-outline note-save">Save note</button> <span class="note-status muted" aria-live="polite">${esc(status)}</span></p>
    </section>`;
  };
  box.onclick = async (ev) => {
    const del = ev.target.closest('.note-del');
    if (del) {
      // a second click deletes: one slip does not lose a note
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete? Click again'; return; }
      del.disabled = true;
      try { await deleteNote(del.closest('.note-row').dataset.id); await draw('Deleted.'); } catch (e) { await draw(e.message); }
      return;
    }
    if (!ev.target.closest('.note-save')) return;
    const text = $('#note-new', box).value.trim();
    if (!text) return;
    ev.target.disabled = true;
    try { await addNote({ ch: store.ch, section, id, text }); await draw('Saved.'); } catch (e) { ev.target.disabled = false; $('.note-status', box).textContent = e.message; }
  };
  await draw();
}
