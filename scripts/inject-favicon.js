// Bakes the favicon chosen in Admin → Favicon into every built page, so first-time visitors see it immediately
// (instead of the default "SS" icon that shows until the page's JavaScript has loaded the setting).
// Runs after `expo export -p web`. Needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Safe to run twice.
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? (e.name === '_expo' || e.name === 'assets' ? [] : walk(p)) : e.name.endsWith('.html') ? [p] : [];
});

(async () => {
  if (!URL_ || !KEY) { console.warn('[favicon] Supabase env vars missing, leaving default icon.'); return; }
  let remote = null;
  try {
    const r = await fetch(`${URL_}/rest/v1/site_settings?select=value&key=eq.favicon_url`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    const rows = await r.json();
    if (typeof rows?.[0]?.value === 'string' && /^https?:\/\//i.test(rows[0].value)) remote = rows[0].value;
  } catch (e) { console.warn('[favicon] Could not read settings:', e.message); }
  if (!remote) { console.warn('[favicon] No favicon_url saved in Admin → Favicon, leaving default icon.'); return; }

  // Prefer a copy served from your own domain (most reliable for tabs, bookmarks and iOS home screen); fall back to the hosted link.
  let href = remote;
  try {
    const res = await fetch(remote);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    fs.writeFileSync(path.join(DIST, 'site-icon.png'), Buffer.from(await res.arrayBuffer()));
    href = '/site-icon.png?v=' + Date.now().toString(36);
  } catch (e) { console.warn('[favicon] Could not download the icon, linking it directly:', e.message); }

  const tags = `<link rel="icon" type="image/png" href="${href}" /><link rel="shortcut icon" href="${href}" /><link rel="apple-touch-icon" href="${href}" />`;
  let n = 0;
  for (const f of walk(DIST)) {
    let html = fs.readFileSync(f, 'utf8');
    if (!html.includes('</head>')) continue;
    html = html.replace(/<link[^>]+rel="(?:shortcut icon|icon|apple-touch-icon)"[^>]*>/gi, '').replace('</head>', tags + '</head>');
    fs.writeFileSync(f, html); n++;
  }
  console.log(`[favicon] Baked favicon into ${n} pages.`);
})();
