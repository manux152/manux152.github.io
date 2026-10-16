import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

const KEYS = ['site_url', 'seo_description', 'seo_og_image', 'seo_twitter', 'seo_city', 'seo_country', 'seo_google_verify', 'seo_bing_verify'];
type Check = { ok: boolean; label: string; fix?: string };

/** Admin → Search visibility: what Google and social apps show for the site, plus a checklist of what is still missing. */
export default function Seo() {
  const { can, settings, reload } = useApp(); const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({}); const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<{ news: number; products: number; players: number; overrides: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setV(Object.fromEntries(KEYS.map((k) => [k, typeof settings[k] === 'string' ? settings[k] : '']))); setReady(true); }, []); // eslint-disable-line
  const scan = useCallback(async () => {
    const head = (t: string, f: (q: any) => any) => f(supabase.from(t).select('id', { count: 'exact', head: true }));
    const [n, p, pl, o] = await Promise.all([
      head('news_posts', (q) => q.not('published_at', 'is', null).or('summary.is.null,summary.eq.')),
      head('products', (q) => q.eq('is_active', true).or('description.is.null,description.eq.')),
      head('players', (q) => q.eq('is_active', true).or('bio.is.null,bio.eq.')),
      head('seo_pages', (q) => q),
    ]);
    setCounts({ news: n.count ?? 0, products: p.count ?? 0, players: pl.count ?? 0, overrides: o.count ?? 0 });
  }, []);
  useEffect(() => { scan(); }, [scan]);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  if (!ready) return <Loading />;
  const set = (k: string, x: string) => setV({ ...v, [k]: x });
  const field = (k: string, label: string, extra: any = {}) => <Input key={k} label={label} value={v[k] ?? ''} onChangeText={(x) => set(k, x)} autoCapitalize="none" {...extra} />;

  const save = async () => {
    setErr(null); setMsg(null);
    if (v.site_url && !/^https:\/\/[^\s/]+/.test(v.site_url.trim())) return setErr('Website address must start with https://');
    if (v.seo_og_image && !/^https:\/\//.test(v.seo_og_image.trim())) return setErr('The share picture must be an https link');
    if ((v.seo_description ?? '').length > 300) return setErr('Keep the description under 300 characters (about 150 shows best in Google)');
    setBusy(true);
    const { error } = await supabase.from('site_settings').upsert(KEYS.map((k) => ({ key: k, value: (v[k] ?? '').trim() })), { onConflict: 'key' });
    setBusy(false);
    if (error) return setErr(error.message);
    await reload(); setMsg('Saved. Search engines pick up the changes the next time they visit.');
  };

  const site = (v.site_url ?? '').replace(/\/$/, '');
  const checks: Check[] = [
    { ok: /^https:\/\//.test(site), label: 'Website address set', fix: 'Add your public https address below. Without it there is no sitemap and no canonical link.' },
    { ok: (v.seo_description ?? '').trim().length >= 70, label: 'Site description (70–300 characters)', fix: 'Write one clear sentence: who you are, where, and what visitors can do here.' },
    { ok: /^https:\/\//.test(v.seo_og_image ?? ''), label: 'Share picture for WhatsApp, Facebook, X', fix: 'Add a 1200×630 picture link.' },
    { ok: !!(v.seo_city ?? '').trim(), label: 'Town / city (helps "football club near me")', fix: 'Add the town or city where you play.' },
    { ok: !!(v.seo_google_verify ?? '').trim(), label: 'Google Search Console connected', fix: 'Paste the verification code from Search Console (steps below).' },
    ...(counts ? [
      { ok: counts.news === 0, label: counts.news ? `${counts.news} published news stories have no summary` : 'Every news story has a summary', fix: 'Open News and add a one-line summary. Google uses it as the description.' },
      { ok: counts.products === 0, label: counts.products ? `${counts.products} shop products have no description` : 'Every product has a description', fix: 'Open Products and describe each item in a sentence or two.' },
      { ok: counts.players === 0, label: counts.players ? `${counts.players} players have no bio` : 'Every player has a bio', fix: 'A two-line bio makes each player page findable by name.' },
    ] : []),
  ];
  const done = checks.filter((c) => c.ok).length;
  return (
    <Screen>
      <H>Search visibility (SEO)</H>
      <T muted>Controls how the club appears on Google, Bing, WhatsApp and social media. Nothing here needs code.</T>
      <Card>
        <T style={{ fontWeight: '800' }}>Checklist · {done} of {checks.length} done</T>
        {checks.map((c) => <T key={c.label} muted={c.ok} style={{ fontSize: 14 }}>{c.ok ? '✅' : '⬜'} {c.label}{!c.ok && c.fix ? `\n     ${c.fix}` : ''}</T>)}
      </Card>
      <Card><T style={{ fontWeight: '800' }}>Your website</T>
        {field('site_url', 'Public address (https://yourclub.com)')}
        {field('seo_description', 'Site description shown in Google', { autoCapitalize: 'sentences', multiline: true })}
        {field('seo_og_image', 'Share picture URL (1200×630, https)')}
        {field('seo_twitter', 'X / Twitter name (optional, e.g. @yourclub)')}</Card>
      <Card><T style={{ fontWeight: '800' }}>Where you are</T>
        {field('seo_city', 'Town / city', { autoCapitalize: 'words' })}{field('seo_country', 'Country', { autoCapitalize: 'words' })}</Card>
      <Card><T style={{ fontWeight: '800' }}>Search engine accounts (free)</T>
        {field('seo_google_verify', 'Google Search Console verification code')}{field('seo_bing_verify', 'Bing Webmaster verification code (optional)')}
        <T muted style={{ fontSize: 13 }}>{`1. Go to search.google.com/search-console and add your site as a "URL prefix".\n2. Choose "HTML tag", copy only the code after content=", paste it above and Save.\n3. Press Verify in Search Console, then Sitemaps → submit:  ${site || 'https://yourclub.com'}/sitemap.xml`}</T></Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
      <Card><T style={{ fontWeight: '800' }}>Page-by-page control</T>
        <T muted>Set a custom Google title, description or share picture for any page (for example /shop or /tryouts), or hide a page from Google.{counts ? ` ${counts.overrides} page${counts.overrides === 1 ? '' : 's'} customised.` : ''}</T>
        <Btn title="Edit page search settings" kind="ghost" onPress={() => router.push('/admin/manage/seoPages' as any)} /></Card>
    </Screen>
  );
}
