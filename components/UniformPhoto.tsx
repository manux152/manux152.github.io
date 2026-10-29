import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Btn, Err, T } from './ui';
import { pickImage, uploadAsset } from '../lib/upload';
import { BRANDING_BUCKET } from '../lib/imageTools';
import { LEADER_PHOTO_SIZE, makeUniformPhoto } from '../lib/uniformPhoto';

/** Picks a picture, crops it to a square at the standard size and uploads it. Calls onChange with the new address (or null when removed).
 *  Nothing is published until the person presses Save on the screen that uses this. */
export function UniformPhoto({ url, onChange, size = 140, folder = 'leadership' }: { url?: string | null; onChange: (url: string | null) => void; size?: number; folder?: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [preview, setPreview] = useState<string | null>(null);
  const choose = async () => {
    setErr(null);
    let a: any;
    try { a = await pickImage(false); } catch (e: any) { return setErr(e?.message ?? 'Could not open your photos.'); }
    if (!a) return;
    setBusy(true);
    try {
      const u = await makeUniformPhoto(a.uri);
      setPreview(u.uri);   // shows the cropped picture straight away
      const publicUrl = await uploadAsset(BRANDING_BUCKET, folder, { ...a, uri: u.uri, width: u.width ?? a.width, height: u.height ?? a.height, mimeType: u.mimeType, fileSize: undefined });
      setPreview(null); onChange(publicUrl);
    } catch (e: any) { setPreview(null); setErr(e?.message ?? 'Upload failed. Please try again.'); }
    setBusy(false);
  };
  const shown = preview ?? url;
  return (
    <View style={{ gap: 8, alignItems: 'flex-start' }}>
      <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: '#E6E8EC', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
        {shown ? <Image key={shown} source={{ uri: shown }} style={{ width: size, height: size }} contentFit="cover" /> : <T muted>No photo</T>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn title={busy ? 'Uploading…' : url ? 'Change photo' : 'Add photo'} kind="ghost" onPress={choose} disabled={busy} />
        {url ? <Btn title="Remove photo" kind="ghost" onPress={() => onChange(null)} disabled={busy} /> : null}
      </View>
      <T muted style={{ fontSize: 12 }}>Every photo is cropped to a square and saved at {LEADER_PHOTO_SIZE} × {LEADER_PHOTO_SIZE} pixels, so all leaders look the same size.</T>
      <Err msg={err} />
    </View>
  );
}
