// Adds the Google Search Console verification tag to the built web pages (dist/index.html and dist/404.html).
// Runs after `expo export -p web` on any host (Cloudflare Pages, GitHub Actions, Vercel, Netlify). Safe to run twice.
const fs = require('fs');
const path = require('path');
const TAG = '<meta name="google-site-verification" content="g7bWAX-1LnhZAScPKDpnPEZ8YFqJTOvdu6ZiQixy2g8" />';
let done = 0;
for (const f of ['index.html', '404.html']) {
  const p = path.join(__dirname, '..', 'dist', f);
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('google-site-verification')) { done++; continue; }
  if (!html.includes('</head>')) { console.error(`No </head> in ${f}`); process.exit(1); }
  fs.writeFileSync(p, html.replace('</head>', TAG + '</head>'));
  done++;
}
if (!done) { console.error('dist/index.html not found - run the web export first'); process.exit(1); }
console.log('google-site-verification tag is in place');
