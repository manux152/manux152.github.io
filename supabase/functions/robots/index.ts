// Deploy WITHOUT JWT verification: supabase functions deploy robots --no-verify-jwt
// Serves /robots.txt with a Sitemap line that always matches the Website address set in Admin → Search visibility.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await db.from('site_settings').select('value').eq('key', 'site_url').maybeSingle();
  const site = String(data?.value ?? '').replace(/\/$/, '');
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /account', 'Disallow: /cart', 'Disallow: /pay-return', 'Disallow: /reset-password', 'Disallow: /profile',
    'Disallow: /orders', 'Disallow: /chat', 'Disallow: /family', 'Disallow: /dashboard', 'Disallow: /login'];
  if (/^https:\/\//.test(site)) lines.push('', `Sitemap: ${site}/sitemap.xml`);
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
});
