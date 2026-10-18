// Application state: the schema, the chapter list as seen from the reading chapter, the reading
// chapter itself, and lastRead — where the reader was before their last jump forward (drives the
// "Since you last read" recap).
import { storage } from './util.js';

export const store = {
  schema: null,
  chapters: [],     // [{n, slug, title, volume}] from /api/chapters?ch=chaptersAt (later titles are null)
  chaptersAt: null,
  ch: null,
  lastRead: Number(storage.get('wiki.lastRead')) || null,
};

// A move from `from` to `to`: jumping forward by more than one chapter (or opening a new
// session further on) records `from` as lastRead. Reading on one chapter at a time keeps it.
export function noteMove(from, to) {
  if (from != null && to > from + 1) {
    store.lastRead = from;
    storage.set('wiki.lastRead', from);
  } else if (store.lastRead != null && to <= store.lastRead) {
    store.lastRead = null; // went back to (or before) it: nothing to recap
    storage.remove('wiki.lastRead');
  }
}

export function rememberChapter(ch) {
  storage.set('wiki.ch', ch);
  const cur = store.chapters.find(c => c.n === ch);
  if (cur?.volume) storage.set('wiki.ch.' + cur.volume, ch);
}

export const sectionOf = (key) => store.schema?.sections.find(s => s.key === key) ?? null;

export const sectionTitle = (key) => (sectionOf(key)?.title ?? key).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export const fieldLabel = (sec, key) =>
  sec?.fields.find(f => f.key === key)?.label ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
