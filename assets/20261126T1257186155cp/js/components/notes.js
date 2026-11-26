// A reader's private notes (PLAN K9, R3): on an entity's Overview (its notes), on a chapter's reading
// page (that chapter's notes) and on #/notes (all of them, by chapter). Kept in the account when
// signed in, in this browser otherwise (notes-store.js). A note is kept with the chapter it was written
// at; one written further on than the reading chapter stays hidden (counted only), like everything else.
import { $, esc } from '../util.js';
import { store } from '../store.js';
import { chip, entityLink } from './ui.js';
import { signedIn } from './account.js';
import { listNotes, addNote, deleteNote, noteHref } from './notes-store.js';

// ch: a chapter's notes (the reading page), saved at that chapter; all: every note, grouped by chapter
// upTo: the last chapter whose notes are shown (the reading chapter, unless the page says otherwise)
// compact: with no note yet, only an "Add a note" button (an entry's Overview stays short)
export async function mountNotes(box, { section = null, id = null, ch = null, all = false, title = 'My notes', onChange = null, upTo = store.ch, limit = null, compact = false } = {}) {
  if (!box) return;
  let opened = !compact;
  const where = signedIn() ? 'Only you can see these.' : 'Kept in this browser only. Sign in to keep them on all your devices.';
  const row = (n) => `<div class="note-row" data-id="${esc(n.id)}"><div>
      ${n.quote ? `<blockquote class="note-quote">${esc(n.quote)}</blockquote>` : ''}
      <p class="note-text">${esc(n.text)}</p>
      <span>${chip(n.ch)}${!id && n.section && n.entity_id ? ` ${entityLink(n.section, n.entity_id, n.entity_id.replace(/_/g, ' '))}` : ''}
        <a class="note-open" href="${noteHref(n, store.ch)}">${n.para ? 'Go to the passage' : n.section ? 'Open' : 'Read the chapter'}</a></span></div>
      <button type="button" class="btn btn-quiet note-del">Delete</button></div>`;
  const draw = async (status = '') => {
    let notes = [];
    let failed = '';
    try { notes = (await listNotes({ section, id, ch })) ?? []; } catch (e) { failed = e.message; }
    const visible = notes.filter(n => n.ch <= upTo);
    const later = notes.length - visible.length;
    const shown = limit ? visible.slice(0, limit) : visible;
    if (!opened && !shown.length && !failed) {
      // a line, not a block: there is nothing in it yet
      box.innerHTML = `<section class="note-box my-notes note-compact" aria-labelledby="my-notes-h"><h2 id="my-notes-h" class="sr-only">${esc(title)}</h2>
        <p><button type="button" class="btn btn-quiet note-start">Add a note on this entry</button></p></section>`;
      return;
    }
    let rows = '';
    if (all) {
      const chapters = [...new Set(shown.map(n => n.ch))].sort((a, b) => b - a);
      rows = chapters.map(c => `<h3 class="note-ch">Chapter ${c}</h3>${shown.filter(n => n.ch === c).map(row).join('')}`).join('');
    } else rows = shown.map(row).join('');
    box.innerHTML = `<section class="block note-box my-notes" aria-labelledby="my-notes-h">
      <h2 id="my-notes-h">${esc(title)}</h2><p class="muted">${esc(where)}</p>
      ${failed ? `<p class="empty">${esc(failed)}</p>` : ''}
      ${rows || (failed ? '' : '<p class="empty">No notes yet.</p>')}
      ${limit && visible.length > limit ? `<p><a href="#/notes?ch=${store.ch}">All my notes (${visible.length})</a></p>` : ''}
      ${later ? `<p class="muted">${later} note${later === 1 ? '' : 's'} written at a later chapter stay${later === 1 ? 's' : ''} hidden until you get there.</p>` : ''}
      ${all ? '' : `<label class="sr-only" for="note-new">New note</label>
      <textarea id="note-new" maxlength="2000" placeholder="A note for yourself, kept at ch ${ch ?? store.ch}"></textarea>
      <p><button type="button" class="btn btn-outline note-save">Save note</button> <span class="note-status muted" aria-live="polite">${esc(status)}</span></p>`}
      ${all && status ? `<p class="note-status muted" aria-live="polite">${esc(status)}</p>` : ''}
    </section>`;
  };
  box.onclick = async (ev) => {
    if (ev.target.closest('.note-start')) { opened = true; await draw(); $('#note-new', box)?.focus(); return; }
    const del = ev.target.closest('.note-del');
    if (del) {
      // a second click deletes: one slip does not lose a note
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete? Click again'; return; }
      del.disabled = true;
      try { await deleteNote(del.closest('.note-row').dataset.id); await draw('Deleted.'); onChange?.(); } catch (e) { await draw(e.message); }
      return;
    }
    if (!ev.target.closest('.note-save')) return;
    const text = $('#note-new', box).value.trim();
    if (!text) return;
    ev.target.disabled = true;
    try { await addNote({ ch: ch ?? store.ch, section, id, text }); await draw('Saved.'); onChange?.(); } catch (e) { ev.target.disabled = false; $('.note-status', box).textContent = e.message; }
  };
  await draw();
}
