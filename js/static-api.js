// The /api/* routes for the static site (PLAN B0): no server, so the wiki database is downloaded
// once (gzipped, name from data/build.json), opened with SQLite WebAssembly, and every API path
// is answered by the same route() the Node server uses. Only `node cli.js export-site` ships
// this file's imports (js/core/, js/vendor/); the server build never loads it.
import sqlite3InitModule from './vendor/sqlite-wasm/index.mjs';
import { openWasmDb } from './core/wasm-db.js';
import { route } from './core/api-router.js';

let ready = null;

// A thin bar at the top while the database downloads.
function progressBar() {
  const bar = document.createElement('div');
  bar.className = 'db-progress';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Loading the wiki data');
  bar.innerHTML = '<span class="db-progress-fill"></span><span class="db-progress-text">Loading the wiki data…</span>';
  document.body.append(bar);
  return {
    set(done, total) {
      const pct = total ? Math.min(100, Math.round(done / total * 100)) : null;
      bar.querySelector('.db-progress-fill').style.width = `${pct ?? 50}%`;
      if (pct != null) bar.setAttribute('aria-valuenow', String(pct));
      bar.querySelector('.db-progress-text').textContent = pct != null
        ? `Loading the wiki data… ${pct}% of ${(total / 1048576).toFixed(1)} MB` : 'Loading the wiki data…';
    },
    done() { bar.remove(); },
  };
}

async function download(url, size, bar) {
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`could not load the wiki data (${res.status})`), { status: 503 });
  const total = Number(res.headers.get('content-length')) || size || 0;
  let done = 0;
  const counted = res.body.pipeThrough(new TransformStream({
    transform(chunk, controller) { done += chunk.byteLength; bar.set(done, total); controller.enqueue(chunk); },
  }));
  return new Uint8Array(await new Response(counted.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

function open() {
  ready ??= (async () => {
    const bar = progressBar();
    try {
      const build = await (await fetch('data/build.json', { cache: 'no-cache' })).json();
      const [sqlite3, bytes] = await Promise.all([sqlite3InitModule(), download(`data/${build.file}`, build.gz_bytes, bar)]);
      return openWasmDb(sqlite3, bytes);
    } finally {
      bar.done();
    }
  })();
  ready.catch(() => { ready = null; }); // let a later call retry after a failed download
  return ready;
}

// Same contract as fetch + r.json() in api.js: resolves to the body, throws {status} on errors.
export async function staticApi(path, { method = 'GET' } = {}) {
  if (method !== 'GET') throw Object.assign(new Error('Not available in this read-only version of the wiki.'), { status: 405 });
  const db = await open();
  const r = route(db, new URL(path, location.href));
  if (r.status !== 200) throw Object.assign(new Error(r.body?.error ?? `${r.status}`), { status: r.status });
  return r.body;
}
