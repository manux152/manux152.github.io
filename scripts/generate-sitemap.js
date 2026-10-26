/**
 * Generates public/sitemap.xml before the web export.
 * Requires Node 18+ (built-in fetch). Uses the Supabase REST API, no extra deps.
 *
 * Env vars: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 * Edit STATIC_ROUTES and DYNAMIC below to match your routes and table names.
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://superstrikers.club';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/fixtures', priority: '0.9', changefreq: 'daily' },
  { path: '/results', priority: '0.8', changefreq: 'daily' },
  { path: '/squad', priority: '0.8', changefreq: 'weekly' },
  { path: '/news', priority: '0.8', changefreq: 'daily' },
  { path: '/shop', priority: '0.7', changefreq: 'weekly' },
];

// Tables that produce one page per row. Adjust table/columns/route to your schema.
const DYNAMIC = [
  {
    table: 'news',
    select: 'slug,updated_at',
    route: (r) => `/news/${r.slug}`,
    lastmod: (r) => r.updated_at,
    priority: '0.6',
    changefreq: 'weekly',
  },
  {
    table: 'fixtures',
    select: 'id,updated_at',
    route: (r) => `/fixtures/${r.id}`,
    lastmod: (r) => r.updated_at,
    priority: '0.5',
    changefreq: 'weekly',
  },
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${esc(SITE + loc)}</loc>`,
    lastmod ? `    <lastmod>${esc(new Date(lastmod).toISOString().slice(0, 10))}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function fetchRows(table, select) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(`[sitemap] Supabase env vars missing, skipping "${table}".`);
    return [];
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[sitemap] Could not load "${table}": ${err.message}`);
    return [];
  }
}

(async () => {
  const entries = STATIC_ROUTES.map((r) =>
    urlEntry({ loc: r.path, changefreq: r.changefreq, priority: r.priority })
  );

  for (const d of DYNAMIC) {
    const rows = await fetchRows(d.table, d.select);
    for (const row of rows) {
      entries.push(
        urlEntry({
          loc: d.route(row),
          lastmod: d.lastmod ? d.lastmod(row) : null,
          changefreq: d.changefreq,
          priority: d.priority,
        })
      );
    }
    console.log(`[sitemap] ${d.table}: ${rows.length} pages`);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') +
    '\n</urlset>\n';

  const out = path.join(__dirname, '..', 'public', 'sitemap.xml');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, xml);
  console.log(`[sitemap] wrote ${entries.length} URLs to public/sitemap.xml`);
})();
