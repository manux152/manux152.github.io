import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Input, Err } from '../../components/ui';
import { ImageEditTools } from '../../components/ImageEditTools';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { checkImageUrl, isWebUrl, makeSquareIcon, pickImages, removeBranding, uploadBranding } from '../../lib/imageTools';

// Admin → Favicon: the small picture shown in the browser tab, bookmarks and "add to home screen".
export default function FaviconAdmin() {
  const { can, settings, reload } = useApp();
  const saved = typeof settings.favicon_url === 'string' ? settings.favicon_url : null;
  const [url, setUrl] = useState<string | null>(saved);
  const [oldUrls, setOldUrls] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  const replaceUrl = (u: string | null) => { if (url && url !== saved) setOldUrls((o) => [...o, url]); setUrl(u); setMsg(null); };

  const upload = async () => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const [a] = await pickImages(1); if (!a) { setBusy(false); return; }
      if (a.fileSize && a.fileSize > 5 * 1048576) throw new Error('Please choose a picture under 5 MB.');
      const square = await makeSquareIcon(a.uri, 256);
      replaceUrl(await uploadBranding('favicon', square));
    } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  const useLink = async () => {
    setErr(null); setMsg(null);
    if (!isWebUrl(link)) return setErr('Paste a full picture link starting with https://');
    setBusy(true);
    const ok = await checkImageUrl(link); setBusy(false);
    if (!ok) return setErr('That link did not load as a picture. Check the address, or upload the picture instead.');
    replaceUrl(link.trim()); setLink('');
  };
  const save = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const { error } = await supabase.from('site_settings').upsert([{ key: 'favicon_url', value: url }], { onConflict: 'key' });
    setBusy(false);
    if (error) return setErr(error.message);
    for (const u of [...oldUrls, ...(saved && saved !== url ? [saved] : [])]) await removeBranding(u);
    setOldUrls([]); await reload(); setMsg(url ? 'Saved. Browsers may take a moment (or a refresh) to show the new icon.' : 'Favicon removed. The default icon is used again.');
  };
  const sizes = [16, 32, 64, 128];
  return (
    <Screen>
      <H>Favicon</H>
      <T muted>The favicon is the small picture in the browser tab. Use a simple, square picture; busy photos are hard to read at 16 pixels.</T>
      <Card>
        <T style={{ fontWeight: '800' }}>Preview</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#DDE1E7', borderTopLeftRadius: 10, borderTopRightRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 260 }}>
          {url ? <Image source={{ uri: url }} style={{ width: 16, height: 16 }} contentFit="cover" accessibilityLabel="" /> : <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#9AA3AE' }} />}
          <T style={{ color: '#222', fontSize: 13 }} numberOfLines={1}>{settings.team_name ?? 'Your site'}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          {sizes.map((n) => (
            <View key={n} style={{ alignItems: 'center', gap: 4 }}>
              {url ? <Image source={{ uri: url }} style={{ width: n, height: n, borderRadius: n / 8 }} contentFit="cover" accessibilityLabel={`${n} pixel preview`} /> : <View style={{ width: n, height: n, borderRadius: n / 8, backgroundColor: '#E6E8EC' }} />}
              <T muted style={{ fontSize: 11 }}>{n}px</T>
            </View>
          ))}
        </View>
        {!url ? <T muted>No favicon chosen. The built-in icon is used.</T> : null}
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Add a picture</T>
        <Btn title={busy ? 'Working…' : 'Upload a picture'} onPress={upload} disabled={busy} />
        <T muted style={{ fontSize: 12 }}>Your picture is cropped to a centred square and resized automatically. PNG, JPG or WebP.</T>
        <Input label="Or paste a picture link" autoCapitalize="none" keyboardType="url" value={link} onChangeText={setLink} placeholder="https://example.com/icon.png" />
        <Btn title="Use this link" kind="ghost" onPress={useLink} disabled={busy || !link.trim()} />
      </Card>
      {url ? (<>
        <Card><ImageEditTools url={url} folder="favicon" format="png" aspects={['1']} onChange={(u) => replaceUrl(u)} /></Card>
        <Btn title="Remove favicon" kind="danger" onPress={() => replaceUrl(null)} />
      </>) : null}
      <Card><T muted style={{ fontSize: 12 }}>This changes the website tab icon. The phone-app icon and the icon when someone installs the site to their home screen come from the app files (assets/icon.png and assets/favicon.png) and change with the next build.</T></Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save favicon'} onPress={save} disabled={busy} />
    </Screen>
  );
}
