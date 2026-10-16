import { useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Chips, Toggle, Err } from '../../components/ui';
import { ImageEditTools } from '../../components/ImageEditTools';
import { Logo } from '../../components/Logo';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { pickImages, removeBranding, uploadBranding } from '../../lib/imageTools';

const SIZES = [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }];
const PLATES = [{ value: 'auto', label: 'White backing' }, { value: 'none', label: 'No backing (transparent logo)' }];

// Admin → Logo & branding: upload, edit and place the club logo (header and footer).
export default function Branding() {
  const { can, settings, reload } = useApp();
  const [url, setUrl] = useState<string | null>(typeof settings.logo_url === 'string' ? settings.logo_url : null);
  const [oldUrls, setOldUrls] = useState<string[]>([]);
  const [size, setSize] = useState<string>(settings.logo_size ?? 'md');
  const [showName, setShowName] = useState<boolean>(settings.logo_show_name !== false && settings.logo_show_name !== 'false');
  const [plate, setPlate] = useState<string>(settings.logo_plate ?? 'auto');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  const replaceUrl = (u: string) => { if (url) setOldUrls((o) => [...o, url]); setUrl(u); };
  const upload = async () => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const [a] = await pickImages(1);
      if (a) { if (a.fileSize && a.fileSize > 8 * 1048576) throw new Error('Please choose a logo under 8 MB.'); replaceUrl(await uploadBranding('logo', a as any)); }
    } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  const save = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const rows = [{ key: 'logo_url', value: url }, { key: 'logo_size', value: size }, { key: 'logo_show_name', value: showName }, { key: 'logo_plate', value: plate }];
    const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) return setErr(error.message);
    for (const u of oldUrls) await removeBranding(u); setOldUrls([]);
    await reload(); setMsg('Saved. Your logo now appears in the header and footer.');
  };
  const prev = { url, size, showName, plate };
  return (
    <Screen>
      <H>Logo & branding</H>
      <T muted>Your club logo appears in the top bar and the website footer. A transparent PNG works best.</T>
      <Card>
        <T style={{ fontWeight: '800' }}>Preview</T>
        <View style={{ backgroundColor: settings.primary_color ?? '#0B6E4F', padding: 16, borderRadius: 10 }}><T muted style={{ color: '#fff', fontSize: 12 }}>Top bar</T><Logo preview={prev} height={34} nameSize={16} /></View>
        <View style={{ backgroundColor: '#14201b', padding: 16, borderRadius: 10 }}><T muted style={{ color: '#cfd8d3', fontSize: 12 }}>Footer</T><Logo preview={prev} /></View>
        <Btn title={busy ? 'Working…' : url ? 'Upload a different logo' : 'Upload logo'} onPress={upload} disabled={busy} />
      </Card>
      {url ? (<>
        <Card>
          <T style={{ fontWeight: '800' }}>Footer size & style</T>
          <T muted>Logo size in the footer</T><Chips options={SIZES} value={size} onChange={(v) => v && setSize(v)} />
          <T muted>Backing behind the logo</T><Chips options={PLATES} value={plate} onChange={(v) => v && setPlate(v)} />
          <Toggle label="Show the team name next to the logo" value={showName} onChange={setShowName} />
        </Card>
        <Card><ImageEditTools url={url} folder="logo" format="png" aspects={['1', '1.3333', '3']} onChange={replaceUrl} /></Card>
        <Btn title="Remove logo" kind="danger" onPress={() => { replaceUrl(null as any); setUrl(null); }} />
      </>) : null}
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
    </Screen>
  );
}
