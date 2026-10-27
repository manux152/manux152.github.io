const fs = require('fs');
const path = require('path');
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DIST = path.join(__dirname, '..', 'dist');
const ROBOTS_FALLBACK = [
  'User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /account', 'Disallow: /cart',
  'Disallow: /pay-return', 'Disallow: /reset-password', 'Disallow: /profile', 'Disallow: /orders',
  'Disallow: /chat', 'Disallow: /family', 'Disallow: /dashboard', 'Disallow: /login', '',
  'Sitemap: https://www.superstrikers.club/sitemap.xml', '',
].join('\n');
async function get(fn) {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, { headers: { Authorization: `Bearer ${KEY}`, apikey: KEY } });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status}`);
  return res.text();
}
(async () => {
  if (!fs.existsSync(DIST)) { console.error('[seo-files] dist/ missing, run expo export first'); process.exit(1); }
  let robots = ROBOTS_FALLBACK;
  try {
    if (!URL_ || !KEY) throw new Error('Supabase env vars missing');
    const sitemap = await get('sitemap');
    if (!sitemap.trim().startsWith('<?xml')) throw new Error('sitemap: not XML');
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);
    console.log('[seo-files] saved sitemap.xml');
  } catch (e) { console.warn('[seo-files] ' + e.message); }
  try {
    const r = await get('robots');
    if (!/user-agent/i.test(r)) throw new Error('robots: unexpected content');
    robots = r;
    console.log('[seo-files] saved robots.txt from Supabase');
  } catch (e) { console.warn('[seo-files] ' + e.message + ' (using fallback robots.txt)'); }
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robots);
})();
