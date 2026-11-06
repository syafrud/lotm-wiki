// Optional reader accounts (PLAN K9), on the static site's Supabase (scripts/supabase/user-data.sql).
// Email and password (Supabase Auth; no email is ever sent). Signed in, the reading chapter, the
// settings and private notes follow the reader to other devices; signed out, everything keeps
// working from this browser. Only the anon key is in the page; row level security keeps every row
// to its owner.
import { storage } from '../util.js';
import { REPORTS_REMOTE, ACCOUNTS_ON, CAPTCHA_KEY } from '../mode.js';

export const ACCOUNTS = ACCOUNTS_ON;
export const PASSWORD_MIN = 10; // keep in step with Supabase: Authentication → Sign In / Providers
const KEY = 'wiki.session';
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

const credentials = (email, password, captcha) => ({
  email: String(email).trim(), password,
  ...(captcha ? { gotrue_meta_security: { captcha_token: captcha } } : {}),
});

// The password goes straight to Supabase over https (it stores a hash) and is never kept here.
export async function signIn(email, password, captcha = '') {
  saveSession(await call('/auth/v1/token', { method: 'POST', query: '?grant_type=password', body: credentials(email, password, captcha) }));
}

export async function signUp(email, password, captcha = '') {
  const s = await call('/auth/v1/signup', { method: 'POST', body: credentials(email, password, captcha) });
  if (!s?.access_token) throw new Error('The account needs an email confirmation, which this wiki does not send ("Confirm email" must be off in Supabase).');
  saveSession(s);
}

// Cloudflare Turnstile on the sign-in form, when the site has a key (config/site.json): with no
// confirmation email it is what keeps scripts from making accounts. → { token(), reset() } or null
let turnstile = null;
export async function mountCaptcha(box) {
  if (!CAPTCHA_KEY) return null;
  turnstile ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = () => resolve(window.turnstile);
    s.onerror = reject;
    document.head.append(s);
  });
  const t = await turnstile;
  let token = '';
  const id = t.render(box, { sitekey: CAPTCHA_KEY, callback: (v) => { token = v; }, 'expired-callback': () => { token = ''; } });
  return { token: () => token, reset: () => { token = ''; t.reset(id); } }; // a token works once
}

export async function signOut() {
  try { await call('/auth/v1/logout', { method: 'POST', auth: true }); } catch { /* signed out here either way */ }
  saveSession(null);
}

// At start: the session saved in this browser, if any
export async function initAccount() {
  if (!ACCOUNTS) return;
  try { session = JSON.parse(storage.get(KEY) || 'null'); } catch { session = null; }
  if (session) await fresh();
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
