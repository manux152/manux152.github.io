import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err } from '../../components/ui';
import { SinglePicture } from '../../components/SinglePicture';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { removeBranding } from '../../lib/imageTools';

const OVERLAYS = [{ value: '0', label: 'None' }, { value: '0.3', label: 'Light' }, { value: '0.55', label: 'Medium' }, { value: '0.75', label: 'Dark' }];
const str = (v: any) => (typeof v === 'string' ? v : '');
const okLink = (u: string) => !u.trim() || /^(\/|https?:\/\/|mailto:|tel:)\S*/i.test(u.trim());
type L = { label: string; url: string };

// Admin → Header & footer: every text and picture of the top and bottom of the website, in one place.
export default function HeaderFooter() {
  const { can, settings, reload } = useApp();
  const [f, setF] = useState({ header_tagline: str(settings.header_tagline), header_notice_text: str(settings.header_notice_text), header_notice_link: str(settings.header_notice_link),
    footer_text: str(settings.footer_text), footer_copyright: str(settings.footer_copyright), footer_banner_caption: str(settings.footer_banner_caption), footer_links_title: str(settings.footer_links_title) });
  const [banner, setBanner] = useState<string | null>(str(settings.footer_banner_image) || null); const [bg, setBg] = useState<string | null>(str(settings.footer_bg_image) || null);
  const [overlay, setOverlay] = useState(String(settings.footer_bg_overlay ?? 0.55));
  const [links, setLinks] = useState<L[]>(Array.isArray(settings.footer_links) ? settings.footer_links : []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  const set = (k: keyof typeof f, v: string) => { setF((c) => ({ ...c, [k]: v })); setMsg(null); };

  const save = async () => {
    setErr(null); setMsg(null);
    if (!okLink(f.header_notice_link)) return setErr('The notice link must start with / (a page in the app) or https://');
    for (const l of links) if (l.label.trim() && !l.url.trim()) return setErr(`“${l.label}” needs a link.`); else if (!okLink(l.url) || (l.url.trim() && !l.label.trim())) return setErr('Each footer link needs a name and a link starting with / or https://');
    setBusy(true);
    const rows = [
      ...Object.entries(f).map(([key, v]) => ({ key, value: v.trim() })),
      { key: 'footer_banner_image', value: banner }, { key: 'footer_bg_image', value: bg }, { key: 'footer_bg_overlay', value: Number(overlay) },
      { key: 'footer_links', value: links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })) },
    ];
    const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    setBusy(false); if (error) return setErr(error.message);
    for (const [old, now] of [[str(settings.footer_banner_image), banner], [str(settings.footer_bg_image), bg]] as const) if (old && old !== now) await removeBranding(old);
    await reload(); setMsg('Saved. The header and footer are updated.');
  };
  const nav = (href: string, title: string, sub: string) => <Link href={href as any} asChild><Pressable accessibilityRole="link"><Card><T style={{ fontWeight: '700' }}>{title} →</T><T muted style={{ fontSize: 12 }}>{sub}</T></Card></Pressable></Link>;
  return (
    <Screen>
      <H>Header & footer</H>
      <T muted>The top and bottom of every page: texts and pictures. Changes go live as soon as you save.</T>

      <H style={{ fontSize: 20 }}>Header</H>
      {nav('/admin/branding', 'Logo & team name', 'The logo picture and name shown in the header and footer')}
      {nav('/admin/nav-appearance', 'Header colours & background picture', 'Theme, gradient, stripes or a picture behind the menu')}
      {nav('/admin/favicon', 'Browser-tab icon (favicon)', 'The small picture in the browser tab')}
      <Card>
        <T style={{ fontWeight: '800' }}>Header texts</T>
        <Input label="Tagline next to the logo (optional, e.g. Pride of Magamaga)" value={f.header_tagline} onChangeText={(v) => set('header_tagline', v)} />
        <Input label="Notice bar above the menu (optional, e.g. Tryouts open this Saturday!)" value={f.header_notice_text} onChangeText={(v) => set('header_notice_text', v)} />
        <Input label="Where the notice goes when tapped (optional: /tryouts or https://…)" autoCapitalize="none" value={f.header_notice_link} onChangeText={(v) => set('header_notice_link', v)} />
      </Card>
      {nav('/admin/hero', 'Home page picture slider', 'Up to 20 pictures with headlines on the home page')}

      <H style={{ fontSize: 20 }}>Footer</H>
      <Card>
        <T style={{ fontWeight: '800' }}>Footer texts</T>
        <Input label="About text (under the logo)" multiline value={f.footer_text} onChangeText={(v) => set('footer_text', v)} />
        <Input label="Copyright line (blank = “© year Team name. All rights reserved.”)" value={f.footer_copyright} onChangeText={(v) => set('footer_copyright', v)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Footer pictures</T>
        <SinglePicture label="Banner picture across the top of the footer" hint="For example a team photo. Wide pictures look best." url={banner} folder="footer" onChange={(u) => { setBanner(u); setMsg(null); }} height={120} />
        {banner ? <Input label="Caption on the banner (optional)" value={f.footer_banner_caption} onChangeText={(v) => set('footer_banner_caption', v)} /> : null}
        <SinglePicture label="Footer background picture" hint="Sits behind the footer text. A darkening layer keeps the text readable." url={bg} folder="footer" onChange={(u) => { setBg(u); setMsg(null); }} />
        {bg ? <><T muted>Darkness over the picture</T><Chips options={OVERLAYS} value={OVERLAYS.find((o) => Number(o.value) === Number(overlay))?.value ?? '0.55'} onChange={(v) => v && setOverlay(v)} /></> : null}
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Your own footer links</T>
        <T muted style={{ fontSize: 12 }}>Shown as an extra column. Use /page-name for pages in the app (for example /tryouts) or a full https:// address.</T>
        <Input label="Column title (blank = “Links”)" value={f.footer_links_title} onChangeText={(v) => set('footer_links_title', v)} />
        {links.map((l, i) => (
          <View key={i} style={{ gap: 6 }}>
            <Input label="Name" value={l.label} onChangeText={(x) => setLinks(links.map((y, j) => (j === i ? { ...y, label: x } : y)))} />
            <Input label="Link" autoCapitalize="none" value={l.url} onChangeText={(x) => setLinks(links.map((y, j) => (j === i ? { ...y, url: x } : y)))} />
            <Btn title="Remove" kind="ghost" onPress={() => setLinks(links.filter((_, j) => j !== i))} />
          </View>))}
        <Btn title="+ Add a link" kind="ghost" onPress={() => setLinks([...links, { label: '', url: '' }])} />
      </Card>
      {nav('/admin/website', 'Contact details & social links', 'Email, phone, address and social media buttons in the footer')}
      {nav('/admin/manage/sponsors', 'Sponsors & partner logos', 'Pictures shown under “Our partners” in the footer')}
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save header & footer'} onPress={save} disabled={busy} />
    </Screen>
  );
}
