// One place for a reader's notes (PLAN R3): the account when signed in (Supabase reader_notes), and
// this browser (localStorage) otherwise — the wiki on this machine has no accounts. A highlight
// (para, start, end, quote) always stays in the browser: it is made on the chapter text, which only
// the wiki on this machine shows, so no words of the novel are ever sent to Supabase.
import { storage } from '../util.js';
import { signedIn, listNotes as accountNotes, addNote as accountAdd, deleteNote as accountDelete } from './account.js';

const KEY = 'wiki.notes';
const local = () => { try { return JSON.parse(storage.get(KEY) || '[]'); } catch { return []; } };
const keep = (list) => storage.set(KEY, JSON.stringify(list));
export const isLocal = (id) => String(id).startsWith('l-');

// [{ id, ch, section, entity_id, text, created_at, para?, start?, end?, quote? }], newest first
export async function listNotes({ section = null, id = null, ch = null } = {}) {
  const fits = (n) => (!section || n.section === section) && (!id || n.entity_id === id) && (ch == null || n.ch === ch);
  const account = signedIn() ? ((await accountNotes({ section, id })) ?? []).filter(fits) : [];
  return [...account, ...local().filter(fits)].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function addNote({ ch, section = null, id = null, text, para = null, start = null, end = null, quote = null }) {
  const body = String(text).trim().slice(0, 2000);
  if (!body) throw new Error('The note is empty.');
  if (signedIn() && !para) return accountAdd({ ch, section, id, text: body });
  const note = { id: `l-${crypto.randomUUID()}`, ch, section, entity_id: id, text: body, created_at: new Date().toISOString(),
    ...(para ? { para, start, end, quote: String(quote ?? '').slice(0, 300) } : {}) };
  keep([...local(), note]);
  return note;
}

export async function deleteNote(noteId) {
  if (isLocal(noteId)) return keep(local().filter(n => n.id !== noteId));
  return accountDelete(noteId);
}

// where a note leads: its highlight, its entry, or its chapter
export const noteHref = (n, ch) => n.para ? `#/read/${n.ch}?note=${encodeURIComponent(n.id)}&ch=${ch}`
  : n.section && n.entity_id ? `#/e/${n.section}/${encodeURIComponent(n.entity_id)}?ch=${ch}` : `#/read/${n.ch}?ch=${ch}`;
