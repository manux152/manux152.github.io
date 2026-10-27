const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo.config.json'), 'utf8'));
const SITE = cfg.siteUrl.replace(/\/+$/, '');
const BRAND = cfg.brandName;
const WHERE = `${cfg.city}, ${cfg.region}`;
const CLUB = `${BRAND} ${cfg.sport} Club`;
const HOME_TITLE = `${CLUB} | Youth ${cfg.sport} in ${WHERE}`;
const at = (what) => `${what} from ${BRAND}, a youth ${cfg.sport.toLowerCase()} club in ${WHERE}.`;

const PAGES = {
  '/': { title: HOME_TITLE, description: cfg.description },
  '/matches': { title: `Fixtures & Results | ${BRAND}`, description: at('Fixtures, results and match reports') },
  '/table': { title: `League Table | ${BRAND}`, description: at('League table and standings') },
  '/squad': { title: `Squad & Players | ${BRAND}`, description: at('Meet the squad, players and coaches') },
  '/news': { title: `News | ${BRAND}`, description: at('Latest news and club updates') },
  '/tryouts': { title: `Tryouts | ${BRAND}`, description: `Find out how to join tryouts for ${BRAND}, a youth ${cfg.sport.toLowerCase()} club in ${WHERE}.` },
  '/shop': { title: `Club Shop | ${BRAND}`, description: `Shop ${BRAND} club gear. A youth ${cfg.sport.toLowerCase()} club in ${WHERE}.` },
  '/calendar': { title: `Calendar & Team Schedules | ${BRAND}`, description: at('Team schedules and calendar') },
};
const SKIP = /^\/(admin|login|account|cart|pay-return|reset-password|profile|orders|chat|family|dashboard|\+not-found|404)(\/|$)/;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const titleCase = (s) => s.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') yield* walk(p); }
    else if (e.name.endsWith('.html')) yield p;
  }
}

function routeOf(file) {
  const rel = path.relative(DIST, file).replace(/\\/g, '/').replace(/\.html$/, '');
  const r = '/' + rel.replace(/(^|\/)index$/, '');
  return r === '/' ? '/' : r.replace(/\/$/, '');
}

function block(route) {
  const known = PAGES[route];
  const last = route.split('/').filter(Boolean).pop() || '';
  const title = known ? known.title : `${titleCase(last)} | ${BRAND}`;
  const description = known ? known.description : cfg.description;
  const url = route === '/' ? `${SITE}/` : `${SITE}${route}`;
  const img = process.env.SHARE_IMAGE_URL || cfg.shareImage || '';
  const lines = [
    `<title data-rh="true">${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:site_name" content="${esc(BRAND)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    img && `<meta property="og:image" content="${esc(img)}" />`,
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    img && `<meta name="twitter:image" content="${esc(img)}" />`,
    cfg.twitterHandle && `<meta name="twitter:site" content="@${esc(cfg.twitterHandle.replace(/^@/, ''))}" />`,
  ].filter(Boolean).map((l) => (l.startsWith('<title') ? l : l.replace(/^<(\w+)/, '<$1 data-rh="true"')));
  let ld = false;
  if (route === '/') {
    ld = true;
    lines.push(`<script type="application/ld+json" data-rh="true">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'SportsTeam', name: BRAND, sport: cfg.sport, url: SITE,
      description: cfg.description, ...(img ? { image: img } : {}),
      location: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: cfg.city, addressRegion: cfg.region, addressCountry: cfg.country } },
    }).replace(/</g, '\\u003c')}</script>`);
  }
  return { html: lines.join(''), ld, known: !!known };
}

if (!fs.existsSync(DIST)) { console.error('[seo] dist/ not found, run the export first'); process.exit(1); }
let n = 0; const generic = [];
for (const f of walk(DIST)) {
  const route = routeOf(f);
  if (SKIP.test(route)) continue;
  let html = fs.readFileSync(f, 'utf8');
  if (!html.includes('</head>')) continue;
  const b = block(route);
  html = html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*\bname=["']description["'][^>]*>/gi, '')
    .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\b[^>]*\bproperty=["']og:[^"']*["'][^>]*>/gi, '')
    .replace(/<meta\b[^>]*\bname=["']twitter:[^"']*["'][^>]*>/gi, '');
  if (b.ld) html = html.replace(/<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace('</head>', b.html + '</head>');
  fs.writeFileSync(f, html); n++;
  if (!b.known) generic.push(route);
}
console.log(`[seo] Baked SEO tags into ${n} pages.`);
if (generic.length) console.log('[seo] Pages using a generated title (add them to PAGES to customize): ' + generic.join(', '));

