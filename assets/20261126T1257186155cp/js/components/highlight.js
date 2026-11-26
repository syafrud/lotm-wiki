// Highlights on the chapter text (PLAN R3): select words → "Add Comment" under the selection → a note
// kept with that passage (paragraph id, character range, the words). Saved notes are drawn back as
// <mark>s; a click on one shows its comment. Works wherever the chapter text is shown.
import { esc } from '../util.js';
import { listNotes, addNote, deleteNote } from './notes-store.js';

const paragraphOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.read-text p[id^="p-"]') ?? null;

// character offset inside paragraph p → the text node and offset there
function locate(p, offset) {
  const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let left = offset, node;
  while ((node = walk.nextNode())) {
    if (left <= node.length) return [node, left];
    left -= node.length;
  }
  return null;
}

// wrap characters [start, end) of paragraph p in a mark; false when they are not there any more
function markRange(p, start, end, attrs) {
  const a = locate(p, start), b = locate(p, end);
  if (!a || !b || end <= start) return null;
  const r = document.createRange();
  r.setStart(...a);
  r.setEnd(...b);
  const mark = document.createElement('mark');
  mark.className = 'note-mark';
  for (const [k, v] of Object.entries(attrs)) mark.setAttribute(k, v);
  try { r.surroundContents(mark); } catch { return null; } // overlaps another highlight
  return mark;
}

// where a saved note's words are now: its range, else the same words elsewhere in the paragraph
function placeOf(p, n) {
  const text = p.textContent;
  if (text.slice(n.start, n.end) === n.quote) return [n.start, n.end];
  const at = n.quote ? text.indexOf(n.quote) : -1;
  return at >= 0 ? [at, at + n.quote.length] : null;
}

export async function mountHighlights(root, ch) {
  const textBox = root.querySelector('.read-text');
  if (!textBox) return { focus() {} };
  const notes = (await listNotes({ ch })).filter(n => n.para);
  for (const n of notes) {
    const p = root.querySelector(`#p-${CSS.escape(n.para)}`);
    if (!p) continue;
    const place = placeOf(p, n);
    // the words are gone from the paragraph: the comment stays, pinned at its start
    if (!place || !markRange(p, ...place, { 'data-note': n.id, tabindex: '0' })) {
      p.insertAdjacentHTML('afterbegin', `<mark class="note-mark note-pin" data-note="${esc(n.id)}" tabindex="0" title="A comment on words that changed">✎</mark>`);
    }
  }
  const byId = new Map(notes.map(n => [n.id, n]));

  // the floating button, under the selection
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn hl-add';
  add.textContent = 'Add Comment';
  add.hidden = true;
  root.append(add);
  let picked = null; // { p, start, end, quote }
  const hide = () => { add.hidden = true; };
  const onSelect = () => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
    const range = sel.getRangeAt(0);
    const p = paragraphOf(range.startContainer);
    if (!p || !textBox.contains(p)) return hide();
    const before = document.createRange();
    before.setStart(p, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    // shortcut: a selection over several paragraphs keeps its first one, enough for a note on a passage
    const end = Math.min(paragraphOf(range.endContainer) === p ? start + range.toString().length : p.textContent.length, start + 300);
    const quote = p.textContent.slice(start, end);
    if (!quote.trim()) return hide();
    picked = { p, start, end, quote };
    const rect = range.getClientRects()[range.getClientRects().length - 1] ?? range.getBoundingClientRect();
    add.style.top = `${Math.min(rect.bottom + 6, innerHeight - 44)}px`;
    add.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 140))}px`;
    add.hidden = false;
  };
  const onSelectionChange = () => { if (!root.isConnected) return document.removeEventListener('selectionchange', onSelectionChange); onSelect(); };
  document.addEventListener('selectionchange', onSelectionChange);
  addEventListener('scroll', hide, { passive: true });
  add.addEventListener('mousedown', (ev) => ev.preventDefault()); // keep the selection

  // the comment box under the paragraph; the chosen words stay lit while it is open
  const openForm = () => {
    if (!picked) return;
    const { p, start, end, quote } = picked;
    hide();
    root.querySelector('.hl-form')?.remove();
    root.querySelector('.note-mark.pending')?.replaceWith(...root.querySelector('.note-mark.pending').childNodes);
    const pending = markRange(p, start, end, { class: 'note-mark pending' });
    document.getSelection()?.removeAllRanges();
    p.insertAdjacentHTML('afterend', `<div class="hl-form" role="group" aria-label="Comment on the selected words">
      <blockquote class="note-quote">${esc(quote)}</blockquote>
      <label class="sr-only" for="hl-text">Comment</label>
      <textarea id="hl-text" maxlength="2000" rows="3" placeholder="Your comment (Ctrl+Enter saves, Esc cancels)"></textarea>
      <p><button type="button" class="btn hl-save">Save</button> <button type="button" class="btn btn-quiet hl-cancel">Cancel</button>
      <span class="hl-status muted" aria-live="polite"></span></p></div>`);
    const form = p.nextElementSibling;
    const box = form.querySelector('textarea');
    box.focus();
    const close = () => { form.remove(); if (pending?.isConnected) pending.replaceWith(...pending.childNodes); };
    const save = async () => {
      if (!box.value.trim()) return box.focus();
      try {
        const n = await addNote({ ch, text: box.value, para: p.id.slice(2), start, end, quote });
        byId.set(n.id, n);
        if (pending) { pending.classList.remove('pending'); pending.dataset.note = n.id; pending.tabIndex = 0; }
        form.remove();
      } catch (e) { form.querySelector('.hl-status').textContent = e.message; }
    };
    form.querySelector('.hl-save').addEventListener('click', save);
    form.querySelector('.hl-cancel').addEventListener('click', close);
    form.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
      else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); }
      ev.stopPropagation(); // typing is not a chapter shortcut
    });
  };
  add.addEventListener('click', openForm);

  // a saved highlight: its comment, and Delete
  const showNote = (mark) => {
    const n = byId.get(mark.dataset.note);
    root.querySelector('.hl-pop')?.remove();
    if (!n) return;
    const p = mark.closest('p');
    p.insertAdjacentHTML('afterend', `<div class="hl-pop" role="note"><p class="note-text">${esc(n.text)}</p>
      <p><button type="button" class="btn btn-quiet hl-del">Delete</button> <button type="button" class="btn btn-quiet hl-close">Close</button></p></div>`);
    const pop = p.nextElementSibling;
    pop.querySelector('.hl-close').addEventListener('click', () => pop.remove());
    pop.querySelector('.hl-del').addEventListener('click', async (ev) => {
      if (!ev.target.dataset.sure) { ev.target.dataset.sure = '1'; ev.target.textContent = 'Delete? Click again'; return; }
      await deleteNote(n.id);
      byId.delete(n.id);
      if (mark.classList.contains('note-pin')) mark.remove(); else mark.replaceWith(...mark.childNodes);
      pop.remove();
    });
  };
  textBox.addEventListener('click', (ev) => { const m = ev.target.closest('.note-mark[data-note]'); if (m) showNote(m); });
  textBox.addEventListener('keydown', (ev) => { const m = ev.target.closest?.('.note-mark[data-note]'); if (m && ev.key === 'Enter') showNote(m); });

  return {
    // #/read/<ch>?note=<id>: the highlight, scrolled to and lit for a moment
    focus(id) {
      const m = root.querySelector(`.note-mark[data-note="${CSS.escape(id)}"]`);
      if (!m) return false;
      requestAnimationFrame(() => {
        m.scrollIntoView({ block: 'center' });
        m.classList.add('flash');
        setTimeout(() => m.classList.remove('flash'), 4000);
        showNote(m);
      });
      return true;
    },
  };
}
