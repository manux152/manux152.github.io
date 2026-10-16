import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err } from '../../components/ui';
import { NavBackground } from '../../components/NavBackground';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { NAV_PRESETS, NAV_STYLES, resolveNavLook } from '../../lib/navTheme';
import { checkImageUrl, isWebUrl, pickImages, removeBranding, uploadBranding } from '../../lib/imageTools';
import { DEFAULT_PREFS } from '../../lib/theme';

const OVERLAYS = [{ value: '0', label: 'None' }, { value: '0.25', label: 'Light' }, { value: '0.45', label: 'Medium' }, { value: '0.65', label: 'Dark' }];

// Admin → Navigation look: the club's default theme and background for the top bar / menu. Visitors can still personalise (if allowed).
export default function NavAppearance() {
  const { can, settings, reload } = useApp();
  const s = (k: string) => (typeof settings[k] === 'string' ? (settings[k] as string) : null);
  const [theme, setTheme] = useState(s('nav_theme') ?? 'brand'); const [style, setStyle] = useState(s('nav_bg_style') ?? 'solid');
  const [color, setColor] = useState(s('nav_bg_color') ?? ''); const [image, setImage] = useState<string | null>(s('nav_bg_image'));
  const [overlay, setOverlay] = useState(String(settings.nav_bg_overlay ?? 0.4)); const [allow, setAllow] = useState(settings.nav_allow_personalise !== false && settings.nav_allow_personalise !== 'false');
  const [link, setLink] = useState(''); const [old, setOld] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  const setImg = (u: string | null) => { if (image && image !== s('nav_bg_image')) setOld((o) => [...o, image]); setImage(u); if (u) setStyle('image'); };
  const validColor = !color || /^#[0-9a-f]{6}$/i.test(color);
  const preview = resolveNavLook({ ...settings, nav_theme: theme, nav_bg_style: style, nav_bg_color: validColor && color ? color : null, nav_bg_image: image, nav_bg_overlay: Number(overlay), nav_allow_personalise: false }, DEFAULT_PREFS, false);

  const upload = async () => {
    setErr(null); setBusy(true);
    try { const [a] = await pickImages(1); if (a) { if (a.fileSize && a.fileSize > 8 * 1048576) throw new Error('Please choose a picture under 8 MB.'); setImg(await uploadBranding('nav', a as any)); } }
    catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  const useLink = async () => {
    setErr(null); if (!isWebUrl(link)) return setErr('Paste a full picture link starting with https://');
    setBusy(true); const ok = await checkImageUrl(link); setBusy(false);
    if (!ok) return setErr('That link did not load as a picture.');
    setImg(link.trim()); setLink('');
  };
  const save = async () => {
    setErr(null); setMsg(null);
    if (!validColor) return setErr('Custom colour must look like #1A2B3C (or leave it empty).');
    if (style === 'image' && !image) return setErr('Add a picture, or choose another background.');
    setBusy(true);
    const rows = [{ key: 'nav_theme', value: theme }, { key: 'nav_bg_style', value: style }, { key: 'nav_bg_color', value: color || null }, { key: 'nav_bg_image', value: image }, { key: 'nav_bg_overlay', value: Number(overlay) }, { key: 'nav_allow_personalise', value: allow }];
    const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    setBusy(false); if (error) return setErr(error.message);
    const prev = s('nav_bg_image'); for (const u of [...old, ...(prev && prev !== image ? [prev] : [])]) await removeBranding(u);
    setOld([]); await reload(); setMsg('Saved. The new look is live.');
  };
  return (
    <Screen>
      <H>Navigation look</H>
      <T muted>Choose the colours and background of the top bar and menu. This is the default everyone sees.</T>
      <Card>
        <T style={{ fontWeight: '800' }}>Preview</T>
        <View style={{ height: 70, borderRadius: 10, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 16 }}>
          <NavBackground look={preview} />
          <T style={{ color: preview.text, fontWeight: '800', fontSize: 18 }}>{settings.team_name ?? 'Super Strikers'}</T>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
            {['Home', 'Matches', 'News', 'Shop'].map((l, i) => <T key={l} style={{ color: preview.text, fontWeight: i === 0 ? '800' : '500', borderBottomWidth: 2, borderBottomColor: i === 0 ? preview.accent : 'transparent', fontSize: 13 }}>{l}</T>)}
          </View>
        </View>
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Colour theme</T>
        <Chips options={NAV_PRESETS.map((p) => ({ value: p.key, label: p.label }))} value={theme} onChange={(v) => v && setTheme(v)} />
        <Input label="Custom colour (optional, overrides the theme colour, e.g. #1A2B3C)" autoCapitalize="none" value={color} onChangeText={setColor} />
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Background</T>
        <Chips options={NAV_STYLES} value={style} onChange={(v) => v && setStyle(v)} />
        {style === 'image' || image ? (<>
          {image ? <Image source={{ uri: image }} style={{ height: 90, borderRadius: 8 }} contentFit="cover" accessibilityLabel="Navigation background picture" /> : null}
          <T muted>Darkness over the picture (keeps the menu readable)</T><Chips options={OVERLAYS} value={OVERLAYS.find((o) => Number(o.value) === Number(overlay))?.value ?? '0.45'} onChange={(v) => v && setOverlay(v)} />
        </>) : null}
        <Btn title={busy ? 'Working…' : image ? 'Upload a different picture' : 'Upload a background picture'} kind="ghost" onPress={upload} disabled={busy} />
        <Input label="Or paste a picture link" autoCapitalize="none" keyboardType="url" value={link} onChangeText={setLink} placeholder="https://…" />
        <Btn title="Use this link" kind="ghost" onPress={useLink} disabled={busy || !link.trim()} />
        {image ? <Btn title="Remove picture" kind="danger" onPress={() => { setImg(null); if (style === 'image') setStyle('gradient'); }} /> : null}
        <T muted style={{ fontSize: 12 }}>Gradient and stripes show on the website; phone apps show the solid colour.</T>
      </Card>
      <Card><Toggle label="Let visitors change the look" hint="Adds an Appearance option to the menu and Settings. Their choice is saved on their own device." value={allow} onChange={setAllow} /></Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save navigation look'} onPress={save} disabled={busy} />
    </Screen>
  );
}
