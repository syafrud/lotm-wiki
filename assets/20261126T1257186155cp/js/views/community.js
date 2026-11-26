// #/community (PLAN R4.5): the readers' forum. Rooms: General (no spoilers), one per volume and one
// per 50 chapters (each shown once the reader has reached its start), and Everything (spoilers,
// behind a warning). A room lists its threads; #/community/<room>/<thread> shows one with its replies.
// Every post carries its writer's chapter, and a reader sees only those at or before their own,
// except in Everything. Held off the public site until Volume 8 is done (mode.js COMMUNITY).
import { $, esc, roman } from '../util.js';
import { store } from '../store.js';
import { COMMUNITY } from '../mode.js';
import { link, notFoundHtml } from '../components/ui.js';
import { mountPosts } from '../components/posts.js';

const SPAN = 50;
const SEEN_WARNING = 'wiki.spoilersOk'; // per tab: Everything was opened after its warning

export function rooms(ch = store.ch) {
  const vols = (store.schema?.volumes ?? []).filter(v => v.first <= ch).map(v => ({
    key: `vol:${v.vol}`, label: v.vol === 'side' ? 'Side Stories' : `Volume ${roman(Number(v.vol))}`, about: `Chapters ${v.first}–${v.last}.`,
  }));
  const ranges = [];
  for (let a = 1; a <= ch; a += SPAN) ranges.push({ key: `range:${a}-${a + SPAN - 1}`, label: `Chapters ${a}–${a + SPAN - 1}`, about: 'Talk about these chapters.' });
  return [
    { key: 'general', label: 'General (no spoilers)', about: 'The novel, the wiki, anything — without telling what happens.' },
    ...vols, ...ranges,
    { key: 'spoilers', label: 'Everything (spoilers)', about: 'Every post, from every chapter. Not for readers who are still on their way.' },
  ];
}
// the room for a chapter's discussion (the reading page links to it)
export const volumeRoom = (n) => {
  const v = (store.schema?.volumes ?? []).find(x => n >= x.first && n <= x.last);
  return v ? `vol:${v.vol}` : 'general';
};

const roomHref = (key) => `#/community/${encodeURIComponent(key)}`;
const hidden = () => ({ title: 'Community', html: '<h1 tabindex="-1">Community</h1><p class="empty">The community is not open on this site yet.</p>' });

export function community(parts) {
  if (!COMMUNITY) return hidden();
  const [roomKey, thread] = parts.map(decodeURIComponent);
  const all = rooms();
  if (!roomKey) {
    return {
      title: 'Community',
      html: `<h1 tabindex="-1">Community</h1>
        <p class="subtitle">Talk with other readers. Each post shows the writer's chapter, and you only see posts from your chapter (${store.ch}) or before, except in Everything.</p>
        <ul class="room-list">${all.map(r => `<li>${link(roomHref(r.key), esc(r.label), 'room-link')} <span class="muted">${esc(r.about)}</span></li>`).join('')}</ul>`,
    };
  }
  const room = all.find(r => r.key === roomKey);
  if (!room) return notFoundHtml(); // unknown, or a volume or range the reader has not reached
  const crumbs = `<p class="kicker">${link('#/community', 'Community')}${thread ? ` · ${link(roomHref(room.key), esc(room.label))}` : ''}</p>`;
  const warned = room.key !== 'spoilers' || sessionStorage.getItem(SEEN_WARNING) === '1';
  if (!warned) {
    return {
      title: room.label,
      html: `${crumbs}<h1 tabindex="-1">${esc(room.label)}</h1>
        <div class="block spoiler-gate"><p><strong>Spoilers ahead.</strong> Posts here come from readers at any chapter, including the very end of the story.</p>
        <p><button type="button" class="btn" id="spoilers-ok">Show me everything</button> ${link('#/community', 'Back to the rooms', 'btn btn-outline')}</p></div>`,
      mount(root) {
        $('#spoilers-ok', root).addEventListener('click', () => {
          try { sessionStorage.setItem(SEEN_WARNING, '1'); } catch {}
          dispatchEvent(new HashChangeEvent('hashchange')); // draw the room again, now open
        });
      },
    };
  }
  if (thread) {
    return {
      title: room.label,
      html: `${crumbs}<h1 tabindex="-1" id="thread-title">Thread</h1><div id="thread-posts"></div>`,
      async mount(root) {
        await mountPosts($('#thread-posts', root), {
          room: room.key, kind: 'reply', thread, where: `Community, ${room.label}`,
          onLoad: ({ posts }) => { if (posts[0]?.title) { $('#thread-title', root).textContent = posts[0].title; document.title = `${posts[0].title} · Mysteries Wiki`; } },
        });
      },
    };
  }
  return {
    title: room.label,
    html: `${crumbs}<h1 tabindex="-1">${esc(room.label)}</h1><p class="subtitle">${esc(room.about)}</p><div id="room-threads"></div>`,
    async mount(root) {
      await mountPosts($('#room-threads', root), { room: room.key, kind: 'thread', where: `Community, ${room.label}`, threadHref: (p) => `${roomHref(room.key)}/${encodeURIComponent(p.id)}` });
    },
  };
}
