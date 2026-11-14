// #/read/<n>?p=<id> (PLAN R2): reading one chapter. In the wiki on this machine the text comes from
// /api/text (the Node server only); the static site has no copy of the novel, so it points to the
// official source instead. Either way, finishing the chapter moves the wiki on to it.
import { $, esc, chapterTitle } from "../util.js";
import { store } from "../store.js";
import { api } from "../api.js";
import { STATIC, OFFICIAL_URL, TEXT_ON } from "../mode.js";
import {
  readStatus,
  startReading,
  finishReading,
  STATUS_LABEL,
} from "../components/progress.js";

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
    body = `<p class="read-note">The novel's text is not on this site...`; // isi lama tetap
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
    </article>`,
    mount(root) {
      startReading(n);
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
      const target =
        params.get("p") &&
        root.querySelector(`#p-${CSS.escape(params.get("p"))}`);
      if (target) {
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
