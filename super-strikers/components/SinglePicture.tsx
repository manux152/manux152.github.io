import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Btn, Err, Input, T } from './ui';
import { BrandingFolder, checkImageUrl, isWebUrl, pickImages, uploadBranding } from '../lib/imageTools';

/** One picture: upload from the device or paste a link, preview, remove. */
export function SinglePicture({ label, hint, url, folder, onChange, height = 110 }: { label: string; hint?: string; url: string | null; folder: BrandingFolder; onChange: (u: string | null) => void; height?: number }) {
  const [link, setLink] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const upload = async () => {
    setErr(null); setBusy(true);
    try { const [a] = await pickImages(1); if (a) { if (a.fileSize && a.fileSize > 8 * 1048576) throw new Error('Please choose a picture under 8 MB.'); onChange(await uploadBranding(folder, a as any)); } }
    catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  const useLink = async () => {
    setErr(null); if (!isWebUrl(link)) return setErr('Paste a full picture link starting with https://');
    setBusy(true); const ok = await checkImageUrl(link); setBusy(false);
    if (!ok) return setErr('That link did not load as a picture.');
    onChange(link.trim()); setLink('');
  };
  return (
    <View style={{ gap: 8 }}>
      <T style={{ fontWeight: '700' }}>{label}</T>
      {hint ? <T muted style={{ fontSize: 12 }}>{hint}</T> : null}
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height, borderRadius: 8 }} contentFit="cover" accessibilityLabel={label} /> : <T muted>No picture chosen.</T>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn title={busy ? 'Working…' : url ? 'Upload a different picture' : 'Upload a picture'} kind="ghost" onPress={upload} disabled={busy} />
        {url ? <Btn title="Remove" kind="danger" onPress={() => onChange(null)} /> : null}
      </View>
      <Input label="Or paste a picture link" autoCapitalize="none" keyboardType="url" value={link} onChangeText={setLink} placeholder="https://…" />
      <Btn title="Use this link" kind="ghost" onPress={useLink} disabled={busy || !link.trim()} />
      <Err msg={err} />
    </View>
  );
}
