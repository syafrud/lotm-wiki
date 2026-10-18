// Which build this page is: the Node server (default) or the static site that `node cli.js
// export-site` writes for GitHub Pages (PLAN B0), marked with <meta name="wiki-mode" content="static">.
// The static site has no server: the database runs in the browser and reader reports are off.
export const STATIC = document.querySelector('meta[name="wiki-mode"]')?.content === 'static';

// CSS hides `.needs-server` elements on the static site.
document.documentElement.dataset.mode = STATIC ? 'static' : 'server';
