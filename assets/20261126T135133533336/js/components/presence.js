// How many readers have the wiki open right now, and how many of them are at the reader's chapter.
// Supabase Realtime Presence on the project the static site already uses: free, no table, nothing
// stored. Each browser joins under a random key it keeps, so several tabs count as one reader, and it
// shares only its chapter number. The local wiki (no Supabase) counts this machine: one reader.
import { REPORTS_REMOTE, STATIC } from '../mode.js';
import { storage } from '../util.js';

const TOPIC = 'realtime:wiki-readers';

// the random id this browser keeps: one reader online, one visitor a day (PLAN R4.2)
export function visitorId() {
  let id = storage.get('wiki.presence');
  if (!id) { id = crypto.randomUUID(); storage.set('wiki.presence', id); }
  return id;
}

// presence state: { key: { metas: [{ phx_ref, ch }] } } → { all, here }
export function countReaders(state, ch) {
  let all = 0, here = 0;
  for (const { metas } of Object.values(state ?? {})) {
    if (!metas?.length) continue;
    all++;
    if (metas.some(m => m.ch === ch)) here++;
  }
  return { all, here };
}

// Phoenix presence diff: joins first, then leaves by phx_ref (a re-track is a join plus a leave)
export function applyDiff(state, { joins = {}, leaves = {} } = {}) {
  const next = { ...state };
  for (const [k, v] of Object.entries(joins)) next[k] = { metas: [...(next[k]?.metas ?? []), ...(v.metas ?? [])] };
  for (const [k, v] of Object.entries(leaves)) {
    const gone = new Set((v.metas ?? []).map(m => m.phx_ref));
    const metas = (next[k]?.metas ?? []).filter(m => !gone.has(m.phx_ref));
    if (metas.length) next[k] = { metas }; else delete next[k];
  }
  return next;
}

let state = null; // null: not connected
export const readersText = (ch) => {
  if (!state) return '';
  const { all, here } = countReaders(state, ch);
  return `● ${all} reading now · ${here} at ch ${ch}`;
};
// the menu's line; the top bar has its own (index.html), both kept in step by refreshReadersLine
export const readersLine = (ch) => { const t = readersText(ch); return `<p class="readers-now" aria-live="off"${t ? '' : ' hidden'}>${t}</p>`; };

// → track(ch): call it with the reader's chapter; onChange() runs when the counts change
export function startPresence(onChange) {
  if (!STATIC) return { track(n) { if (state?.me?.metas[0].ch === n) return; state = { me: { metas: [{ ch: n }] } }; onChange(); } };
  if (!REPORTS_REMOTE || !('WebSocket' in window)) return { track() {} };
  const { url, key } = REPORTS_REMOTE;
  const id = visitorId();
  let ws = null, ref = 0, beat = null, retry = 2000, joined = false, ch = null;
  const send = (event, payload, topic = TOPIC) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref) }));
  };
  const track = () => { if (joined && ch != null) send('presence', { type: 'presence', event: 'track', payload: { ch } }); };
  const connect = () => {
    ws = new WebSocket(`${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
    ws.onopen = () => {
      retry = 2000;
      send('phx_join', { config: { broadcast: { self: false }, presence: { key: id } }, access_token: key });
      beat = setInterval(() => send('heartbeat', {}, 'phoenix'), 25000);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.topic !== TOPIC) return;
      if (m.event === 'phx_reply' && !joined && m.payload?.status === 'ok') { joined = true; track(); }
      else if (m.event === 'presence_state') { state = m.payload ?? {}; onChange(); }
      else if (m.event === 'presence_diff') { state = applyDiff(state ?? {}, m.payload); onChange(); }
    };
    // a full free tier or a lost connection hides the line and tries again later, never more often than a minute
    ws.onclose = () => {
      clearInterval(beat);
      joined = false;
      state = null;
      onChange();
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 60000);
    };
  };
  connect();
  return { track(n) { if (n === ch) return; ch = n; track(); } };
}

// keep the top bar's chip and the menu's line in step without redrawing the sidebar
export function refreshReadersLine(ch) {
  const t = readersText(ch);
  for (const el of document.querySelectorAll('.readers-now')) { el.textContent = t; el.hidden = !t; }
}
