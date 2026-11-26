// PLAN R4.3: public posts — a chapter's comments and the community's threads and replies — the same
// on both builds. The static site writes to Supabase (scripts/supabase/community.sql: signed-in
// readers with a display name); the wiki on this machine to /api/posts (src/server.js: one reader, no
// accounts, a name kept in this browser, the dashboard's Admin view moderates). Every post is stamped
// with its writer's chapter; a reader sees only posts stamped at or before their own.
// Posts are plain text: esc() and line breaks, never HTML.
import { $, esc, storage } from '../util.js';
import { api } from '../api.js';
import { STATIC } from '../mode.js';
import { store } from '../store.js';
import { signedIn, isAdmin, rpc, rest } from './account.js';

const LOCAL_NAME = 'wiki.localName';
export const LOCAL_DEFAULT = 'Reader on this machine';
const NAME = /^[A-Za-z0-9 _-]{3,24}$/; // as in community.sql and src/community.js
const localAdmin = () => storage.get('wiki.localRole') === 'admin';
const canModerate = () => (STATIC ? isAdmin() : localAdmin());
const send = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

// → { posts, ahead } (see listPosts in src/community.js)
export function listPosts(room, { thread = null, upTo = store.ch, before = null } = {}) {
  if (STATIC) return rpc('list_posts', { p_room: room, p_up_to: upTo, p_thread: thread, p_before: before });
  const q = new URLSearchParams({ room, upTo: String(upTo) });
  if (thread) q.set('thread', thread);
  if (before) q.set('before', before);
  if (localAdmin()) q.set('admin', '1');
  return api(`/api/posts?${q}`, { fresh: true });
}

// the name posts are signed with: null until a signed-in reader has chosen one (static site)
export async function myName() {
  if (!STATIC) return storage.get(LOCAL_NAME) || LOCAL_DEFAULT;
  return signedIn() ? rpc('my_name') : null;
}
export async function setName(name) {
  name = String(name).trim();
  if (!NAME.test(name)) throw new Error('A name is 3 to 24 letters, digits, spaces, _ or -.');
  if (!STATIC) return storage.set(LOCAL_NAME, name);
  try { await rest('reader_profiles', { method: 'POST', query: '?on_conflict=user_id', body: { name } }); }
  catch (e) { throw e.status === 409 ? new Error('That name is taken: please choose another.') : e; }
}

async function addPost({ room, thread = null, title = null, body, ch }) {
  if (!STATIC) return api('/api/posts', send('POST', { room, thread_id: thread, title, body, ch, name: await myName() }));
  return rest('posts', { method: 'POST', prefer: 'return=representation', body: { room, thread_id: thread, title, body, ch } });
}
const one = (id) => `?id=eq.${encodeURIComponent(id)}`;
const deletePost = (id) => (STATIC ? rest('posts', { method: 'DELETE', query: one(id) }) : api(`/api/posts/${encodeURIComponent(id)}`, send('DELETE')));
const hidePost = (id, hidden) => (STATIC ? rest('posts', { method: 'PATCH', query: one(id), body: { hidden } }) : api(`/api/posts/${encodeURIComponent(id)}`, send('PATCH', { hidden })));
const banWriter = (id) => rpc('ban_writer', { p_post: id });

const day = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const plain = (s) => esc(s).replace(/\n/g, '<br>');

function postHtml(p, { where, mod }) {
  return `<li class="post${p.hidden ? ' post-hidden' : ''}" data-id="${esc(p.id)}">
    <p class="post-meta"><strong>${esc(p.name)}</strong> <span class="muted">· at ch ${Number(p.ch)} · <time datetime="${esc(p.created_at)}">${day(p.created_at)}</time>${p.hidden ? ' · hidden' : ''}</span></p>
    <p class="post-body">${plain(p.body)}</p>
    <p class="post-actions">
      <a href="#/report?from=${encodeURIComponent(`${where}, post ${p.id}`)}">Report</a>
      ${p.mine ? '<button type="button" class="btn-quiet" data-act="delete">Delete</button>' : ''}
      ${mod ? `<button type="button" class="btn-quiet" data-act="hide">${p.hidden ? 'Unhide' : 'Hide'}</button>` : ''}
      ${mod && STATIC && !p.mine ? '<button type="button" class="btn-quiet" data-act="ban">Ban writer</button>' : ''}
    </p></li>`;
}

function threadHtml(p, href) {
  return `<li class="thread-row${p.hidden ? ' post-hidden' : ''}">
    <a class="thread-title" href="${href(p)}">${esc(p.title)}</a>
    <span class="muted">${esc(p.name)} · at ch ${Number(p.ch)} · ${p.replies} repl${p.replies === 1 ? 'y' : 'ies'} · last ${day(p.last_at)}${p.hidden ? ' · hidden' : ''}</span></li>`;
}

// the writing part: sign in first (static), then a name, then the form
async function composeHtml(kind, idBase, ch) {
  if (STATIC && !signedIn()) return `<p class="post-signin"><a class="btn btn-outline" href="#/account">Sign in to ${kind === 'comment' ? 'comment' : 'write'}</a> <span class="muted">Reading needs no account.</span></p>`;
  const name = await myName().catch(() => null);
  if (!name) return `<form class="post-form" data-form="name">
      <label for="${idBase}-name">Choose a display name (others see it, never your email)</label>
      <input id="${idBase}-name" maxlength="24" required autocomplete="nickname">
      <div class="form-actions"><button class="btn" type="submit">Save name</button><span class="form-status" role="status"></span></div></form>`;
  const label = { comment: 'Write a comment', thread: 'Start a thread', reply: 'Write a reply' }[kind];
  return `<form class="post-form" data-form="post">
      ${kind === 'thread' ? `<label for="${idBase}-title">Title</label><input id="${idBase}-title" maxlength="120" required>` : ''}
      <label for="${idBase}-body">${label} <span class="muted">as ${esc(name)}${STATIC ? '' : ` (<a href="#" data-act="rename">change</a>)`}</span></label>
      <textarea id="${idBase}-body" rows="3" maxlength="2000" required></textarea>
      <p class="muted">It is stamped with your chapter (ch ${ch}): readers behind you will not see it. No spoilers past it, please.</p>
      <div class="form-actions"><button class="btn" type="submit">Post</button><span class="form-status" role="status"></span></div></form>`;
}

// box: where to draw. kind: 'comment' (a chapter's comments), 'thread' (a room's threads) or 'reply'
// (one thread: its opening post and replies). ch: the stamp for new posts. where: words for reports.
// threadHref(p): the link of a thread in a room. onLoad({ posts, ahead }): after each load.
export async function mountPosts(box, { room, kind, thread = null, ch = store.ch, upTo = store.ch, where = '', heading = '', threadHref = null, onLoad = null }) {
  const idBase = `post-${kind}`;
  let before = null, shown = [];
  const draw = async ({ more = false } = {}) => {
    let data;
    try { data = await listPosts(room, { thread, upTo, before: more ? before : null }); }
    catch { box.innerHTML = `${heading ? `<h2>${esc(heading)}</h2>` : ''}<p class="empty">Posts could not be loaded just now.</p>`; return; }
    shown = more ? [...shown, ...data.posts] : data.posts;
    before = data.posts.length === 30 ? data.posts.at(-1).last_at : null;
    onLoad?.(data);
    if (kind === 'reply' && !shown.length) { box.innerHTML = '<p class="empty">This thread is from further ahead in the story, or it was removed.</p>'; return; }
    const mod = canModerate();
    const list = kind === 'thread'
      ? `<ul class="thread-list">${shown.map(p => threadHtml(p, threadHref)).join('')}</ul>`
      : `<ul class="post-list">${shown.map(p => postHtml(p, { where, mod })).join('')}</ul>`;
    const empty = { comment: 'No comments yet.', thread: 'No threads here yet.', reply: '' }[kind];
    const ahead = data.ahead ? `<p class="muted posts-ahead">${data.ahead} ${kind === 'thread' ? `thread${data.ahead === 1 ? '' : 's'}` : `post${data.ahead === 1 ? '' : 's'}`} from readers further ahead ${data.ahead === 1 ? 'is' : 'are'} hidden until you reach their chapter.</p>` : '';
    const compose = await composeHtml(kind, idBase, ch);
    box.innerHTML = `${heading ? `<h2>${esc(heading)}${kind === 'comment' ? ` <span class="muted">(${shown.length}${before ? '+' : ''})</span>` : ''}</h2>` : ''}
      ${kind === 'reply' ? '' : compose}
      ${shown.length ? list : empty ? `<p class="empty">${empty}</p>` : ''}
      ${before ? '<p><button type="button" class="btn btn-outline" data-act="older">Older</button></p>' : ''}
      ${ahead}
      ${kind === 'reply' ? compose : ''}`;
  };
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const status = $('.form-status', form);
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      if (form.dataset.form === 'name') await setName($('input', form).value);
      else await addPost({ room, thread, ch, body: $('textarea', form).value.trim(), title: $(`#${idBase}-title`, form)?.value.trim() || null });
      await draw();
      $('textarea', box)?.focus();
    } catch (err) {
      status.textContent = err.message || 'Could not post just now.';
      status.className = 'form-status bad';
      button.disabled = false;
    }
  });
  box.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    e.preventDefault();
    if (act === 'older') return draw({ more: true });
    if (act === 'rename') {
      const label = e.target.closest('label');
      label.parentElement.insertAdjacentHTML('afterbegin', `<span class="rename"><input aria-label="Display name" maxlength="24" value="${esc(await myName())}"> <button type="button" class="btn btn-outline" data-act="save-name">Save name</button></span>`);
      return;
    }
    if (act === 'save-name') {
      try { await setName(e.target.previousElementSibling.value); await draw(); } catch (err) { e.target.insertAdjacentHTML('afterend', ` <span class="form-status bad">${esc(err.message)}</span>`); }
      return;
    }
    const id = e.target.closest('[data-id]')?.dataset.id;
    const p = shown.find(x => x.id === id);
    if (!p) return;
    // a second press confirms a delete or a ban (the house pattern for removing)
    if ((act === 'delete' || act === 'ban') && e.target.dataset.armed !== '1') {
      e.target.dataset.armed = '1';
      e.target.textContent = act === 'delete' ? 'Press again to delete' : 'Press again to ban';
      return;
    }
    try {
      if (act === 'delete') await deletePost(id);
      if (act === 'hide') await hidePost(id, !p.hidden);
      if (act === 'ban') await banWriter(id);
      await draw();
    } catch (err) { e.target.insertAdjacentHTML('afterend', ` <span class="form-status bad">${esc(err.message || 'That did not work.')}</span>`); }
  });
  await draw();
  return { reload: draw };
}
