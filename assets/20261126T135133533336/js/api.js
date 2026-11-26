// JSON API client with a small LRU cache. Responses depend only on the build and the URL,
// so a cached promise can be reused; the server's ETag handles the browser cache.
// On the static site (mode.js) the same paths are answered in the browser by static-api.js.
import { STATIC } from './mode.js';

const MAX_ENTRIES = 10;
const cache = new Map(); // path -> Promise
let staticModule = null;

async function fetchJson(path, options) {
  if (STATIC) {
    staticModule ??= import('./static-api.js');
    return (await staticModule).staticApi(path.replace(/^\//, ''), options);
  }
  const r = await fetch(path, options);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `${r.status} ${r.statusText}`), { status: r.status });
  }
  return r.json();
}

// GET through the cache (fresh: true skips it); anything else goes straight to the server.
export function api(path, { fresh = false, ...options } = {}) {
  if ((options.method && options.method !== 'GET') || fresh) return fetchJson(path, options);
  if (cache.has(path)) {
    const hit = cache.get(path);
    cache.delete(path); // move to the most recent end
    cache.set(path, hit);
    return hit;
  }
  const p = fetchJson(path).catch((err) => { cache.delete(path); throw err; });
  cache.set(path, p);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return p;
}
