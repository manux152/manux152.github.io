import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { SocialIcon } from '../../components/SocialIcon';
import { checkImageUrl, isWebUrl, pickImages, removeBranding, uploadBranding } from '../../lib/imageTools';
import type { SocialLink } from '../../lib/socialIcons';

const KEYS = ['site_url', 'hero_title', 'hero_subtitle', 'hero_image_url', 'hero_cta_label', 'hero_cta_route', 'contact_email', 'contact_phone', 'contact_address', 'footer_text'];

export default function WebsiteSettings() {
  const { can, settings, reload } = useApp();
  const [v, setV] = useState<Record<string, string>>({}); const [social, setSocial] = useState<SocialLink[]>([]); const [iconLink, setIconLink] = useState<Record<number, string>>({}); const [iconBusy, setIconBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [ready, setReady] = useState(false);
  useEffect(() => {
    setV(Object.fromEntries(KEYS.map((k) => [k, typeof settings[k] === 'string' ? settings[k] : ''])));
    setSocial(Array.isArray(settings.social_links) ? settings.social_links : []); setReady(true);
  }, []); // eslint-disable-line
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  if (!ready) return <Loading />;
  const set = (k: string, x: string) => setV({ ...v, [k]: x });

  const save = async () => {
    setErr(null); setMsg(null);
    if (v.site_url && !/^https:\/\/[^\s/]+/.test(v.site_url.trim())) return setErr('Website address must start with https://');
    for (const s of social) if (s.url && !/^https?:\/\//i.test(s.url)) return setErr(`"${s.label || 'Link'}" must start with https://`);
    if (v.hero_cta_route && !v.hero_cta_route.startsWith('/')) return setErr('The hero button route must start with / (for example /tryouts)');
    setBusy(true);
    const rows = [...KEYS.map((k) => ({ key: k, value: (v[k] ?? '').trim() })), { key: 'social_links', value: social.filter((s) => s.label.trim() && s.url.trim()).map((s) => ({ label: s.label.trim(), url: s.url.trim(), ...(s.icon_url ? { icon_url: s.icon_url } : {}) })) }];
    const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) return setErr(error.message);
    await reload(); setMsg('Saved. The website and app are updated.');
  };
  const patch = (i: number, p: Partial<SocialLink>) => setSocial((c) => c.map((y, j) => (j === i ? { ...y, ...p } : y)));
  const uploadIcon = async (i: number) => {
    setErr(null); setMsg(null); setIconBusy(i);
    try {
      const [a] = await pickImages(1); if (!a) return;
      if (a.fileSize && a.fileSize > 2 * 1048576) throw new Error('Please choose an icon under 2 MB.');
      const old = social[i]?.icon_url; patch(i, { icon_url: await uploadBranding('social', a) }); removeBranding(old);
    } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setIconBusy(null);
  };
  const useIconLink = async (i: number) => {
    setErr(null); setMsg(null); const u = (iconLink[i] ?? '').trim();
    if (!isWebUrl(u)) return setErr('Paste a full picture link starting with https://');
    setIconBusy(i); const ok = await checkImageUrl(u); setIconBusy(null);
    if (!ok) return setErr('That link did not load as a picture. Check the address, or upload the picture instead.');
    patch(i, { icon_url: u }); setIconLink((c) => ({ ...c, [i]: '' }));
  };
  const resetIcon = (i: number) => { removeBranding(social[i]?.icon_url); patch(i, { icon_url: undefined }); };
  const field = (k: string, label: string, extra: any = {}) => <Input key={k} label={label} value={v[k] ?? ''} onChangeText={(x) => set(k, x)} autoCapitalize="none" {...extra} />;
  return (
    <Screen>
      <H>Website</H>
      <T muted>Everything visitors see on the home page and footer. Team name, colors and logo stay under Site settings.</T>
      <Card><T style={{ fontWeight: '800' }}>Website address</T>{field('site_url', 'Public address (https://yourclub.com) — used in emails, payments and the sitemap')}</Card>
      <Card><T style={{ fontWeight: '800' }}>Home page banner</T>
        {field('hero_title', 'Headline (blank = team name)', { autoCapitalize: 'sentences' })}{field('hero_subtitle', 'Sub-headline', { autoCapitalize: 'sentences' })}
        {field('hero_image_url', 'Banner picture URL (https, optional)')}{field('hero_cta_label', 'Main button text (e.g. Join our tryouts)', { autoCapitalize: 'sentences' })}{field('hero_cta_route', 'Main button goes to (e.g. /tryouts, /shop, /news)')}</Card>
      <Card><T style={{ fontWeight: '800' }}>Contact (shown in the footer)</T>
        {field('contact_email', 'Email')}{field('contact_phone', 'Phone')}{field('contact_address', 'Address', { autoCapitalize: 'sentences', multiline: true })}{field('footer_text', 'Footer text', { autoCapitalize: 'sentences', multiline: true })}</Card>
      <Card><T style={{ fontWeight: '800' }}>Social links</T>
        {social.map((s, i) => (
          <View key={i} style={{ gap: 6 }}>
            <Input label="Name (e.g. Instagram)" value={s.label} onChangeText={(x) => setSocial(social.map((y, j) => (j === i ? { ...y, label: x } : y)))} />
            <Input label="Link (https://…)" autoCapitalize="none" value={s.url} onChangeText={(x) => setSocial(social.map((y, j) => (j === i ? { ...y, url: x } : y)))} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><SocialIcon link={s} size={22} /><T muted style={{ flex: 1, fontSize: 12 }}>{s.icon_url ? 'Your own icon' : 'Official logo (picked from the name or link)'}</T></View>
            <Btn title={iconBusy === i ? 'Working…' : 'Upload an icon picture'} kind="ghost" onPress={() => uploadIcon(i)} disabled={iconBusy === i} />
            <Input label="…or paste an icon picture link (https://…)" autoCapitalize="none" value={iconLink[i] ?? ''} onChangeText={(x) => setIconLink((c) => ({ ...c, [i]: x }))} onSubmitEditing={() => useIconLink(i)} />
            {(iconLink[i] ?? '').trim() ? <Btn title="Use this link as the icon" kind="ghost" onPress={() => useIconLink(i)} disabled={iconBusy === i} /> : null}
            {s.icon_url ? <Btn title="Go back to the official logo" kind="ghost" onPress={() => resetIcon(i)} /> : null}
            <Btn title="Remove this link" kind="ghost" onPress={() => { resetIcon(i); setSocial(social.filter((_, j) => j !== i)); }} />
          </View>))}
        <Btn title="+ Add a link" kind="ghost" onPress={() => setSocial([...social, { label: '', url: '' }])} /></Card>
      <Link href={'/admin/manage/sponsors' as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>Sponsors & partners (logos in the footer) →</T></Card></Pressable></Link>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
    </Screen>
  );
}
