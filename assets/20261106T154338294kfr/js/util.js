// Small DOM and text helpers shared by every module.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "sealed_artifact" -> "Sealed artifact"
export const enumLabel = (v) => { const s = String(v ?? '').replace(/_/g, ' '); return s ? s[0].toUpperCase() + s.slice(1) : s; };

// Chapter titles are stored as printed, in capitals ("THE SEER’S SUGGESTION"); show them in title
// case ("The Seer’s Suggestion"). Small words stay lower case inside the title; a title that
// already has lower-case letters is left as it is.
const SMALL_WORDS = new Set('a an and as at but by for from in into nor of on onto or over per the to via vs with'.split(' '));
export function chapterTitle(title) {
  const s = String(title ?? '');
  if (!s || /[a-z]/.test(s)) return s;
  const words = s.toLowerCase().split(' ');
  return words.map((w, i) => {
    const core = w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    if (i > 0 && i < words.length - 1 && SMALL_WORDS.has(core)) return w;
    return w.replace(/^([^a-z0-9]*)([a-z])/, (m, lead, c) => lead + c.toUpperCase()).replace(/-([a-z])/g, (m, c) => '-' + c.toUpperCase());
  }).join(' ');
}

// Search snippets mark matches with \u0001 … \u0002; escape first, then mark.
export const markSnippet = (s) => esc(s).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');

// localStorage that never throws (private windows, blocked storage).
export const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

// Is the keyboard focus in something that takes text or choices?
export const isTyping = (el = document.activeElement) =>
  !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

// 2 -> "II" (volume numbers in the archive style)
export function roman(n) {
  let v = Number(n), out = '';
  for (const [k, s] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (v >= k) { out += s; v -= k; }
  return out;
}

// "Volume 2: Faceless" -> { n: 2, name: "Faceless" }; null for anything else
export function volumeParts(volume) {
  const m = /^Volume (\d+)(?::\s*(.+))?$/.exec(String(volume ?? ''));
  return m ? { n: Number(m[1]), name: m[2] ?? '' } : null;
}
