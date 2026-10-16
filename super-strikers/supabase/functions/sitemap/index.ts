// Deploy WITHOUT JWT verification: supabase functions deploy sitemap --no-verify-jwt
// Serves a live sitemap.xml built from your content. Point your website's /sitemap.xml at this function
// (rewrite rules are in vercel.json and public/_redirects — replace YOUR-PROJECT-REF), then submit it in Google Search Console.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: st } = await db.from('site_settings').select('value').eq('key', 'site_url').maybeSingle();
  const site = String(st?.value ?? '').replace(/\/$/, '');
  if (!/^https:\/\//.test(site)) return new Response('Set the site_url setting first', { status: 400 });
  const urls: { loc: string; lastmod?: string }[] = ['', '/matches', '/table', '/news', '/players', '/stats', '/calendar', '/media', '/awards', '/tryouts', '/shop', '/season-review']
    .map((p) => ({ loc: site + p }));
  const [news, players, products, tryouts, matches] = await Promise.all([
    db.from('news_posts').select('slug,published_at').not('published_at', 'is', null).lte('published_at', new Date().toISOString()).limit(1000),
    db.from('players').select('id').eq('is_active', true).limit(500),
    db.from('products').select('slug,created_at').eq('is_active', true).limit(1000),
    db.from('tryouts').select('id,starts_at').eq('is_published', true).limit(200),
    db.from('matches').select('id,kickoff_at').order('kickoff_at', { ascending: false }).limit(300),
  ]);
  (news.data ?? []).forEach((n: any) => urls.push({ loc: `${site}/news/${n.slug}`, lastmod: n.published_at?.slice(0, 10) }));
  (players.data ?? []).forEach((p: any) => urls.push({ loc: `${site}/player/${p.id}` }));
  (products.data ?? []).forEach((p: any) => urls.push({ loc: `${site}/product/${p.slug}`, lastmod: p.created_at?.slice(0, 10) }));
  (tryouts.data ?? []).forEach((t: any) => urls.push({ loc: `${site}/tryout/${t.id}`, lastmod: t.starts_at?.slice(0, 10) }));
  (matches.data ?? []).forEach((m: any) => urls.push({ loc: `${site}/match/${m.id}`, lastmod: m.kickoff_at?.slice(0, 10) }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
});
