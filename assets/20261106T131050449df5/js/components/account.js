// Optional reader accounts (PLAN K9), on the static site's Supabase (scripts/supabase/user-data.sql).
// Signing in sends a link to the reader's email (Supabase Auth, PKCE: the link comes back with
// ?code=…, swapped here for a session). Signed in, the reading chapter, the settings and private
// notes follow the reader to other devices; signed out, everything keeps working from this browser.
// Only the anon key is in the page; row level security keeps every row to its owner.
import { storage } from '../util.js';
import { REPORTS_REMOTE, ACCOUNTS_ON } from '../mode.js';

export const ACCOUNTS = ACCOUNTS_ON;
const KEY = 'wiki.session';
const VERIFIER = 'wiki.pkce';
let session = null; // { access_token, refresh_token, expires_at (s), email }
const listeners = new Set();

export const signedIn = () => !!session;
export const accountEmail = () => session?.email ?? null;
export const onAccountChange = (fn) => listeners.add(fn);
const changed = () => { for (const fn of listeners) fn(signedIn()); };

function saveSession(s) {
  session = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600), email: s.user?.email ?? s.email ?? null } : null;
  if (session) storage.set(KEY, JSON.stringify(session)); else storage.remove(KEY);
  changed();
}

async function call(path, { method = 'GET', body, auth = false, query = '' } = {}) {
  const { url, key } = REPORTS_REMOTE;
  if (auth) await fresh();
  const r = await fetch(`${url}${path}${query}`, {
    method,
    headers: {
      apikey: key, 'content-type': 'application/json',
      authorization: `Bearer ${auth && session ? session.access_token : key}`,
      ...(method === 'POST' && path.startsWith('/rest/') ? { prefer: 'resolution=merge-duplicates,return=representation' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.msg ?? data?.message ?? data?.error_description ?? `account: ${r.status}`), { status: r.status });
  return data;
}

// a session within a minute of expiring is refreshed first
async function fresh() {
  if (!session || session.expires_at - 60 > Date.now() / 1000) return;
  try { saveSession({ ...(await call('/auth/v1/token', { method: 'POST', query: '?grant_type=refresh_token', body: { refresh_token: session.refresh_token } })), email: session.email }); }
  catch { saveSession(null); }
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// email → a sign-in link; it opens the wiki again at `back` (this page) with ?code=…
export async function sendSignInLink(email) {
  const verifier = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  storage.set(VERIFIER, verifier);
  const back = `${location.origin}${location.pathname}`;
  await call('/auth/v1/otp', { method: 'POST', query: `?redirect_to=${encodeURIComponent(back)}`, body: { email: String(email).trim(), create_user: true, code_challenge: challenge, code_challenge_method: 's256' } });
}

export async function signOut() {
  try { await call('/auth/v1/logout', { method: 'POST', auth: true }); } catch { /* signed out here either way */ }
  saveSession(null);
}

// At start: a saved session, or the ?code= of a sign-in link (then removed from the address).
// → { link: true when the page was opened from a sign-in link, message }
export async function initAccount() {
  if (!ACCOUNTS) return { link: false, message: '' };
  try { session = JSON.parse(storage.get(KEY) || 'null'); } catch { session = null; }
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const failed = params.get('error_description');
  if (code || failed) history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
  if (failed) return { link: true, message: `Signing in did not work: ${failed}` };
  if (code) {
    try { saveSession(await call('/auth/v1/token', { method: 'POST', query: '?grant_type=pkce', body: { auth_code: code, code_verifier: storage.get(VERIFIER) ?? '' } })); }
    catch (e) { return { link: true, message: `Signing in did not work: ${e.message}. Ask for a new link (on this device).` }; }
    storage.remove(VERIFIER);
    return { link: true, message: 'You are signed in.' };
  }
  if (session) await fresh();
  return { link: false, message: '' };
}

// ---- the reader's rows ----

export async function loadProgress() {
  return (await call('/rest/v1/reader_progress', { auth: true, query: '?select=ch' }))?.[0]?.ch ?? null;
}
let progressTimer = null;
// at most once every 10 s: the last chapter wins
export function saveProgress(ch) {
  if (!signedIn()) return;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => call('/rest/v1/reader_progress', { method: 'POST', auth: true, query: '?on_conflict=user_id', body: { ch } }).catch(() => {}), 10000);
}

export async function loadSettings() {
  return (await call('/rest/v1/reader_settings', { auth: true, query: '?select=arrow_keys,confirm_jump' }))?.[0] ?? null;
}
export function saveSettings(s) {
  if (!signedIn()) return Promise.resolve();
  return call('/rest/v1/reader_settings', { method: 'POST', auth: true, query: '?on_conflict=user_id', body: s }).catch(() => {});
}

export function listNotes({ section = null, id = null } = {}) {
  const filter = section && id ? `&section=eq.${encodeURIComponent(section)}&entity_id=eq.${encodeURIComponent(id)}` : '';
  return call('/rest/v1/reader_notes', { auth: true, query: `?select=id,ch,section,entity_id,text,created_at&order=created_at.desc${filter}` });
}
export function addNote({ ch, section = null, id = null, text }) {
  return call('/rest/v1/reader_notes', { method: 'POST', auth: true, body: { ch, section, entity_id: id, text: String(text).trim().slice(0, 2000) } });
}
export function deleteNote(noteId) {
  return call('/rest/v1/reader_notes', { method: 'DELETE', auth: true, query: `?id=eq.${Number(noteId)}` });
}
