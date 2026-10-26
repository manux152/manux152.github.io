import { useEffect, useState } from 'react';
import Head from 'expo-router/head';
import { usePathname } from 'expo-router';
import { useApp } from '../lib/app-context';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import seo from '../seo.config.json'; // build-time defaults, so the exported HTML has a real title, description and canonical

// Per-page overrides from Admin → Search visibility (SEO). Loaded once and shared by every page.
type Override = { path: string; title: string | null; description: string | null; image_url: string | null; noindex: boolean };
let cache: Promise<Override[]> | null = null;
const loadOverrides = () => (cache ??= Promise.resolve(supabase.from('seo_pages').select('path,title,description,image_url,noindex')).then((r: any) => (r.data ?? []) as Override[], () => []));

const clean = (s?: string | null, n = 160) => (s ?? '').replace(/[#*_`>\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Sets the tab title and everything search engines and social apps read: description, canonical address, social preview card,
 * "noindex" for private pages, and structured data (JSON-LD). Website only — no effect in the phone apps.
 * Anything set in Admin → Search visibility (SEO) wins over the defaults passed in by each screen.
 */
export function PageHead({ title, description, image, type = 'website', jsonLd, noindex }: {
  title?: string; description?: string | null; image?: string | null; type?: 'website' | 'article'; jsonLd?: object | null; noindex?: boolean;
}) {
  const { settings } = useApp(); const { t } = useI18n(); const path = usePathname() || '/';
  const [over, setOver] = useState<Override | undefined>();
  useEffect(() => { let on = true; loadOverrides().then((all) => { if (on) setOver(all.find((o) => o.path === path)); }); return () => { on = false; }; }, [path]);

  const team = str(settings.team_name) || seo.brandName;
  const site = (str(settings.site_url) || seo.siteUrl).replace(/\/$/, '');
  const pageTitle = over?.title || (title ? t(title) : '');
  const full = pageTitle ? `${pageTitle} · ${team}` : team;
  const desc = clean(over?.description || description || str(settings.seo_description) || str(settings.hero_subtitle) || seo.description);
  const img = over?.image_url || image || str(settings.seo_og_image) || str(settings.hero_image_url) || str(settings.logo_url) || seo.shareImage || '';
  const canonical = site ? site + (path === '/' ? '' : path) : '';
  const hide = !!(noindex || over?.noindex);
  const twitter = str(settings.seo_twitter).replace(/^@?/, '@');

  const social = Array.isArray(settings.social_links) ? (settings.social_links as any[]).map((s) => s?.url).filter((u) => /^https?:\/\//.test(u ?? '')) : [];
  const graph: object[] = [];
  if (path === '/' && site) {
    const city = str(settings.seo_city) || seo.city, country = str(settings.seo_country) || seo.country;
    graph.push({
      '@context': 'https://schema.org', '@type': 'SportsTeam', name: team, url: site, sport: 'Soccer', description: desc || undefined,
      logo: str(settings.logo_url) || undefined, image: img || undefined, sameAs: social.length ? social : undefined,
      location: (city || country) ? { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: city || undefined, addressCountry: country || undefined } } : undefined,
    });
    graph.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: team, url: site, potentialAction: { '@type': 'SearchAction', target: `${site}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' } });
  }
  if (jsonLd) graph.push(jsonLd);

  return (
    <Head>
      <title>{full}</title>
      {desc ? <meta name="description" content={desc} /> : null}
      <meta name="robots" content={hide ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1'} />
      {canonical && !hide ? <link rel="canonical" href={canonical} /> : null}
      {str(settings.seo_google_verify) ? <meta name="google-site-verification" content={str(settings.seo_google_verify)} /> : null}
      {str(settings.seo_bing_verify) ? <meta name="msvalidate.01" content={str(settings.seo_bing_verify)} /> : null}
      <meta property="og:site_name" content={team} />
      <meta property="og:title" content={full} />
      {desc ? <meta property="og:description" content={desc} /> : null}
      {img ? <meta property="og:image" content={img} /> : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:type" content={type} />
      <meta name="twitter:card" content={img ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={full} />
      {desc ? <meta name="twitter:description" content={desc} /> : null}
      {img ? <meta name="twitter:image" content={img} /> : null}
      {twitter.length > 1 ? <meta name="twitter:site" content={twitter} /> : null}
      {graph.map((g, i) => <script key={i} type="application/ld+json">{JSON.stringify(g)}</script>)}
    </Head>
  );
}
