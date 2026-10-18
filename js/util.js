// Small DOM and text helpers shared by every module.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "sealed_artifact" -> "Sealed artifact"
export const enumLabel = (v) => { const s = String(v ?? '').replace(/_/g, ' '); return s ? s[0].toUpperCase() + s.slice(1) : s; };

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
