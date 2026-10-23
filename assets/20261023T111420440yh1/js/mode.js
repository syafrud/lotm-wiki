// Which build this page is: the Node server (default) or the static site that `node cli.js
// export-site` writes for GitHub Pages (PLAN B0), marked with <meta name="wiki-mode" content="static">.
// The static site has no server: the database runs in the browser, and reader reports go to
// Supabase when export-site was given its address (config/site.json, meta "wiki-reports-url").
export const STATIC = document.querySelector('meta[name="wiki-mode"]')?.content === 'static';

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content ?? '';
export const REPORTS_REMOTE = STATIC && meta('wiki-reports-url')
  ? { url: meta('wiki-reports-url').replace(/\/+$/, ''), key: meta('wiki-reports-key') }
  : null;
// can readers send and read reports here?
export const REPORTS = !STATIC || !!REPORTS_REMOTE;

// CSS hides `.needs-server` elements on the static site and `.needs-reports` where reports are off.
document.documentElement.dataset.mode = STATIC ? 'static' : 'server';
document.documentElement.dataset.reports = REPORTS ? 'on' : 'off';
