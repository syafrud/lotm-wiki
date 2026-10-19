// Reader reports in both builds: the Node server keeps them (/api/report, /api/reports); the static
// site sends them to Supabase (table `reports`, insert only) and reads the public view
// `public_reports` (no contact, no spoiler category, not hidden) — scripts/supabase/reports.sql.
// Either way a reader only sees reports sent from a chapter they have read (ch <= N): a report
// written at chapter 300 may talk about chapter 300.
import { api } from '../api.js';
import { REPORTS, REPORTS_REMOTE } from '../mode.js';

const LIMIT = 200;
const COLUMNS = 'id,created_at,ch,category,where_text,message,status';
const cache = new Map(); // ch -> Promise<list>

function remote(path, options = {}) {
  const { url, key } = REPORTS_REMOTE;
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    // a legacy anon key is a JWT and goes in Authorization too; a new "sb_publishable_…" key only in apikey
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json', ...(options.headers ?? {}) },
  }).then(async (r) => {
    if (r.ok) return r.status === 204 || r.status === 201 ? null : r.json();
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.message ?? `reports: ${r.status}`), { status: r.status });
  });
}

// { ch, category, where, message, contact, website } — website is the honeypot
export async function sendReport(report) {
  if (!REPORTS) throw new Error('Reports are not available in this version of the wiki.');
  cache.clear();
  if (!REPORTS_REMOTE) {
    return api('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
  }
  if (String(report.website ?? '').trim()) return null; // a bot filled the hidden field: drop it quietly
  const message = String(report.message ?? '').trim().slice(0, 2000);
  if (!message) throw new Error('message is required');
  const ch = Number(report.ch);
  if (!Number.isInteger(ch) || ch < 1) throw new Error('bad chapter');
  return remote('reports', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      ch, message,
      category: String(report.category ?? 'other'),
      where_text: String(report.where ?? '').trim().slice(0, 200),
      contact: String(report.contact ?? '').trim().slice(0, 200),
    }),
  });
}

// The public reports a reader at chapter `ch` may see, newest first:
// [{ at, ch, category, where, message, status }]
export function listReports(ch) {
  if (!REPORTS) return Promise.resolve([]);
  if (!cache.has(ch)) {
    const p = REPORTS_REMOTE
      ? remote(`public_reports?select=${COLUMNS}&ch=lte.${ch}&order=created_at.desc&limit=${LIMIT}`)
        .then(rows => rows.map(r => ({ at: r.created_at, ch: r.ch, category: r.category, where: r.where_text ?? '', message: r.message, status: r.status ?? 'shown' })))
      : api(`/api/reports?ch=${ch}`, { fresh: true });
    cache.set(ch, p.catch((err) => { cache.delete(ch); throw err; }));
  }
  return cache.get(ch);
}

// How many of them were sent from chapter `ch` itself / about the page `where` ("Characters › Klein Moretti").
export async function reportCounts(ch, where = null) {
  try {
    const list = await listReports(ch);
    return { chapter: list.filter(r => r.ch === ch).length, page: where ? list.filter(r => r.where === where).length : 0 };
  } catch {
    return { chapter: 0, page: 0 }; // a notice, never a reason to break the page
  }
}
