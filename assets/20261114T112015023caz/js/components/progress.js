// Reading status per chapter (PLAN R2), kept in this browser: finished chapters and the one being
// read. Finishing a chapter moves the wiki on to it, never back, so reading a chapter again (or
// pressing the button twice) changes nothing but its mark.
import { storage } from '../util.js';
import { store } from '../store.js';
import { setChapter } from './picker.js';

const READ = 'wiki.read';
const READING = 'wiki.reading';
export const STATUS_LABEL = { read: 'Read', reading: 'Reading', unread: 'Not read' };

function readSet() {
  try { return new Set(JSON.parse(storage.get(READ) || '[]')); } catch { return new Set(); }
}

export const readStatus = (n) => (readSet().has(n) ? 'read' : Number(storage.get(READING)) === n ? 'reading' : 'unread');

export function startReading(n) {
  if (!readSet().has(n)) storage.set(READING, String(n));
}

export function finishReading(n) {
  const done = readSet();
  done.add(n);
  storage.set(READ, JSON.stringify([...done].sort((a, b) => a - b)));
  if (Number(storage.get(READING)) === n) storage.remove(READING);
  // the account keeps the chapter through setChapter → rememberChapter → saveProgress
  if (n > store.ch && store.chapters.some(c => c.n === n)) setChapter(n, { confirmed: true });
}

export const statusBadge = (n) => {
  const s = readStatus(n);
  return `<span class="read-mark read-${s}">${STATUS_LABEL[s]}</span>`;
};
