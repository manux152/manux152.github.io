/**
 * Pulls your admin SEO settings from Supabase and writes seo.config.json,
 * which Seo.tsx, +html.tsx and the sitemap script read at build time.
 * If Supabase is unreachable, the existing seo.config.json (defaults) is kept.
 *
 * Env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 *      SEO_SETTINGS_TABLE (optional, default "site_settings")
 *
 * Supports a single-row table (one column per setting) or a key/value table
 * (columns "key" and "value"). Column names are matched from the lists below;
 * add yours if they differ.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'seo.config.json');
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TABLE = process.env.SEO_SETTINGS_TABLE || 'site_settings';

const CANDIDATES = {
  siteUrl: ['public_url', 'public_address', 'site_url', 'website_url', 'url', 'domain'],
  description: ['site_description', 'description', 'meta_description', 'seo_description'],
  shareImage: ['share_image', 'share_image_url', 'share_picture', 'og_image', 'og_image_url'],
  twitterHandle: ['twitter', 'twitter_handle', 'twitter_name', 'x_handle', 'x_name'],
  city: ['city', 'town', 'town_city', 'town_or_city', 'location_city'],
  region: ['state', 'region'],
  country: ['country'],
};

const STATE_ABBR = { minnesota: 'MN' };

const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

const toObject = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return {};
  if ('key' in rows[0] && 'value' in rows[0]) {
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
  return rows[0];
};

const normUrl = (u) => {
  let s = u.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.replace(/^http:\/\//i, 'https://');
};

const abbr = (r) => STATE_ABBR[r.toLowerCase()] || r;

(async () => {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[seo] Supabase env vars missing, keeping seo.config.json defaults.');
    return;
  }

  let raw;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*&limit=200`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = toObject(await res.json());
  } catch (err) {
    console.warn(`[seo] Could not read "${TABLE}" (${err.message}); keeping defaults.`);
    return;
  }

  const found = {};
  for (const [field, keys] of Object.entries(CANDIDATES)) {
    const v = pick(raw, keys);
    if (v) found[field] = v;
  }

  if (found.siteUrl) cfg.siteUrl = normUrl(found.siteUrl);
  if (found.description) cfg.description = found.description;
  if (found.shareImage) cfg.shareImage = found.shareImage;
  if (found.twitterHandle) cfg.twitterHandle = found.twitterHandle.replace(/^@/, '');
  if (found.country) cfg.country = found.country === 'United States' ? 'US' : found.country;

  // "New Hope, Minnesota" in one field -> city + region
  if (found.city) {
    const [c, ...rest] = found.city.split(',').map((s) => s.trim());
    cfg.city = c;
    if (rest.length) cfg.region = abbr(rest.join(', '));
  }
  if (found.region) cfg.region = abbr(found.region);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
  console.log('[seo] Updated seo.config.json from Supabase:', Object.keys(found).join(', ') || '(no matching columns)');
})();
