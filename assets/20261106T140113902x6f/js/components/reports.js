// Reader reports in both builds: the Node server keeps them (/api/report, /api/reports); the static
// site sends them to Supabase (table `reports`, insert only) and reads the public view
// `public_reports` (no contact, no spoiler category, not hidden) — scripts/supabase/reports.sql.
// Either way a reader only sees reports sent from a chapter they have read (ch <= N): a report
// written at chapter 300 may talk about chapter 300. On the static site every report also has a
// status, set at #/admin; a finished one stays public in the History, with its update.
import { api } from '../api.js';
import { REPORTS, REPORTS_REMOTE } from '../mode.js';

const LIMIT = 200;
const COLUMNS = 'id,created_at,ch,category,where_text,message,status,credit,update_id,reply,image_path';
const IMAGE_BUCKET = 'report-images';
const IMAGE_MAX = 1000000; // bytes; the bucket refuses more than 1 MiB
const cache = new Map(); // ch or "history ch" -> Promise<list>

export const STATUS = { unread: 'Not read yet', read: 'Read', checked: 'Checked', in_progress: 'In progress', done: 'Done', not_changed: 'Checked, no change' };
export const FINISHED = ['done', 'not_changed'];
export const forgetReports = () => cache.clear();
export const reportImage = (name) => `${REPORTS_REMOTE.url}/storage/v1/object/public/${IMAGE_BUCKET}/${name}`;

// a legacy anon key is a JWT and goes in Authorization too; a new "sb_publishable_…" key only in apikey
const keyHeaders = () => {
  const { key } = REPORTS_REMOTE;
  return { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) };
};

function remote(path, options = {}) {
  return fetch(`${REPORTS_REMOTE.url}/rest/v1/${path}`, {
    ...options,
    headers: { ...keyHeaders(), 'content-type': 'application/json', ...(options.headers ?? {}) },
  }).then(async (r) => {
    if (r.ok) return r.status === 204 || r.status === 201 ? null : r.json();
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.message ?? `reports: ${r.status}`), { status: r.status });
  });
}

// A picture is drawn again before it leaves the browser: at most 1600 px, always a JPEG (never an
// SVG, which can hold a script), and without the location a phone stores in a photo.
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; // a JPEG has no transparency
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob && blob.size <= IMAGE_MAX) return blob;
  }
  throw new Error('picture too large');
}

async function uploadImage(file) {
  const name = `${crypto.randomUUID()}.jpg`;
  const r = await fetch(`${REPORTS_REMOTE.url}/storage/v1/object/${IMAGE_BUCKET}/${name}`, {
    method: 'POST', headers: { ...keyHeaders(), 'content-type': 'image/jpeg' }, body: await shrinkImage(file),
  });
  if (!r.ok) throw new Error(`picture: ${r.status}`);
  return name;
}

// { ch, category, where, message, contact, credit, image, website } — image: a File or nothing,
// website: the honeypot. → { imageFailed } when the report went out without its picture.
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
  const image = report.image ? await uploadImage(report.image).catch(() => null) : null;
  await remote('reports', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      ch, message,
      category: String(report.category ?? 'other'),
      where_text: String(report.where ?? '').trim().slice(0, 200),
      contact: String(report.contact ?? '').trim().slice(0, 200),
      credit: String(report.credit ?? '').trim().slice(0, 80),
      ...(image ? { image_path: image } : {}),
    }),
  });
  return { imageFailed: !!report.image && !image };
}

const publicRows = (query) => remote(`public_reports?select=${COLUMNS}&${query}`)
  .then(rows => rows.map(r => ({ at: r.created_at, ch: r.ch, category: r.category, where: r.where_text ?? '', message: r.message, status: r.status, credit: r.credit, update: r.update_id, reply: r.reply, image: r.image_path })));

function cached(key, load) {
  if (!cache.has(key)) cache.set(key, load().catch((err) => { cache.delete(key); throw err; }));
  return cache.get(key);
}

// The public reports a reader at chapter `ch` may see, newest first:
// [{ at, ch, category, where, message, status, credit, update, reply, image }]
export function listReports(ch) {
  if (!REPORTS) return Promise.resolve([]);
  return cached(ch, () => (REPORTS_REMOTE
    ? publicRows(`ch=lte.${ch}&order=created_at.desc&limit=${LIMIT}`)
    : api(`/api/reports?ch=${ch}`, { fresh: true })));
}

// The finished ones on their own: new reports must never push them out of the newest LIMIT.
// shortcut: stops at 1000 (Supabase's page size), add paging if the History ever gets there
export function listHistory(ch) {
  if (!REPORTS_REMOTE) return Promise.resolve([]);
  return cached(`history ${ch}`, () => publicRows(`ch=lte.${ch}&status=in.(${FINISHED})&order=created_at.desc&limit=1000`));
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
