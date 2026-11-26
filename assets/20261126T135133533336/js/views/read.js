// #/read/<n>?p=<id> (PLAN R2): reading one chapter. In the wiki on this machine the text comes from
// /api/text (the Node server only); the static site has no copy of the novel, so it points to the
// official source instead. Either way, finishing the chapter moves the wiki on to it.
import { $, esc, chapterTitle } from "../util.js";
import { store } from "../store.js";
import { api } from "../api.js";
import { STATIC, OFFICIAL_URL, TEXT_ON, COMMUNITY } from "../mode.js";
import {
  readStatus,
  startReading,
  finishReading,
  STATUS_LABEL,
} from "../components/progress.js";
import { mountNotes } from "../components/notes.js";
import { mountHighlights } from "../components/highlight.js";
import { mountPosts } from "../components/posts.js";
import { link } from "../components/ui.js";
import { volumeRoom } from "./community.js";

const href = (n) => `#/read/${n}?ch=${store.ch}`;
// server: /api/text; static site: the exported JSON next to index.html (works under /<repo>/)
async function loadText(n) {
  if (!STATIC) return api(`/api/text/${n}`, { fresh: true });
  const r = await fetch(`data/text/${n}.json`);
  if (!r.ok) throw new Error("no text");
  return r.json();
}
export async function read(n, params) {
  const known = store.chapters.find((c) => c.n === n);
  let text = null,
    failed = false;
  if (!STATIC || TEXT_ON) {
    try {
      text = await loadText(n);
    } catch {
      failed = true;
    }
  }
  const title =
    text?.title ?? (known?.title ? chapterTitle(known.title) : null);
  const prev = text?.prev ?? (n > 1 ? n - 1 : null);
  const next = text
    ? text.next
    : STATIC && store.chapters.some((c) => c.n === n + 1)
      ? n + 1
      : null;
  const ahead =
    n > store.ch + 1
      ? `<p class="read-note">The wiki is at chapter ${store.ch}. You can read on: finishing this chapter moves the wiki here, and the chapters in between stay unread.</p>`
      : "";
  const notInWiki = !known
    ? `<p class="read-note">The wiki has no entries for this chapter yet.</p>`
    : "";
  let body;
  if (STATIC && !TEXT_ON) {
    body = `<p class="read-note">The novel's text is not on this site: it belongs to its author and publisher.</p>
      ${OFFICIAL_URL ? `<p><a class="btn btn-outline" href="${esc(OFFICIAL_URL)}" target="_blank" rel="noopener">Read chapter ${n} at the official source</a></p>` : ""}`;
  } else if (failed) {
    body = '<p class="empty">The text of this chapter could not be found.</p>';
  } else if (!text.paragraphs.length) {
    body = '<p class="empty">This chapter has no text yet.</p>';
  } else {
    body = `<div class="read-text">${text.paragraphs.map((p) => `<p id="p-${esc(p.id)}">${esc(p.text)}</p>`).join("")}</div>`;
  }
  const nav = `<nav class="read-nav" aria-label="Chapters">
    ${prev ? `<a href="${href(prev)}" rel="prev">← Chapter ${prev}</a>` : "<span></span>"}
    ${known ? `<a href="#/?ch=${Math.max(store.ch, n <= store.ch ? n : store.ch)}">Back to the wiki</a>` : '<a href="#/">Back to the wiki</a>'}
    ${next ? `<a href="${href(next)}" rel="next">Chapter ${next} →</a>` : "<span></span>"}
  </nav>`;
  return {
    title: `Read chapter ${n}`,
    html: `<article class="read-page">
      <p class="kicker">Read · <span id="read-status">${STATUS_LABEL[readStatus(n)]}</span></p>
      <h1 tabindex="-1">Chapter ${n}${title ? `: ${esc(title)}` : ""}</h1>
      ${ahead}${notInWiki}
      ${body}
      <div class="read-end" id="read-end">
        <button type="button" class="btn" id="read-done">I finished this chapter</button>
        <span class="form-status" id="read-done-status" role="status"></span>
      </div>
      ${nav}
      ${COMMUNITY ? `<section class="block read-comments" id="read-comments"></section>
      <p class="muted">${link(`#/community/${encodeURIComponent(volumeRoom(n))}`, "Discuss this volume in the community")}</p>` : ""}
      <div id="read-notes"></div>
    </article>`,
    async mount(root) {
      startReading(n);
      // PLAN R4.4: readers' comments on this chapter, stamped with the writer's chapter (at least this one)
      if (COMMUNITY) mountPosts($("#read-comments", root), { room: `ch:${n}`, kind: "comment", heading: "Comments", ch: Math.max(store.ch, n), upTo: Math.max(store.ch, n), where: `Comments on chapter ${n}` });
      // PLAN R3: this chapter's notes (a reader reading ahead sees the ones of the chapter in front of them)
      mountNotes($("#read-notes", root), { ch: n, upTo: Math.max(store.ch, n), title: "My notes on this chapter" });
      const status = $("#read-status", root);
      const done = () => {
        finishReading(n);
        status.textContent = STATUS_LABEL.read;
        $("#read-done-status", root).textContent =
          `Chapter ${n} is marked as read.`;
      };
      $("#read-done", root).addEventListener("click", done);
      if (readStatus(n) === "read") status.textContent = STATUS_LABEL.read;
      // the passage a wiki fact comes from: after the router's own scroll, then lit for a moment
      // "~id": no paragraph matched the fact clearly, so this is the closest one found
      // PLAN R3: highlights with their comments, where the text is shown; ?note=<id> opens one
      const highlights = await mountHighlights(root, n);
      if (params.get("note") && highlights.focus(params.get("note"))) return;
      const want = params.get("p") ?? "";
      const target = want && root.querySelector(`#p-${CSS.escape(want.replace(/^~/, ""))}`);
      if (target) {
        if (want.startsWith("~")) target.insertAdjacentHTML("beforebegin", '<p class="read-guess" id="read-guess">Closest passage found: the fact may be told across the paragraphs around it.</p>');
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: "center" });
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
          target.classList.add("flash");
          setTimeout(() => target.classList.remove("flash"), 4000);
        });
      }
      // finished when the end comes into view after the reader has moved the page themselves
      const end = $("#read-end", root);
      if (text?.paragraphs.length && "IntersectionObserver" in window) {
        let moved = false;
        const onMove = () => {
          moved = true;
        };
        for (const ev of ["wheel", "touchmove", "keydown"])
          window.addEventListener(ev, onMove, { passive: true, once: true });
        const seen = new IntersectionObserver((entries) => {
          if (
            !entries.some((e) => e.isIntersecting) ||
            !moved ||
            !end.isConnected
          )
            return;
          seen.disconnect();
          if (readStatus(n) !== "read") done();
        });
        seen.observe(end);
      }
    },
  };
}
