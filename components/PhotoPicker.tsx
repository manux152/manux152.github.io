import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Btn, Err, T } from './ui';
import { pickImage, uploadAsset } from '../lib/upload';

// Square profile photo: shows the current one and uploads a new one to the given bucket/folder.
export function PhotoPicker({ url, bucket, folder, onUploaded, size = 110 }: { url?: string | null; bucket: string; folder: string; onUploaded: (url: string) => void | Promise<void>; size?: number }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const choose = async () => {
    setErr(null);
    const a = await pickImage(false); if (!a) return;   // original picture, no forced crop
    if (a.fileSize && a.fileSize > 10 * 1048576) return setErr('Please choose a photo under 10 MB.');
    setBusy(true);
    try { await onUploaded(await uploadAsset(bucket, folder, a)); } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E6E8EC', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" /> : <T muted>No photo</T>}
      </View>
      <Btn title={busy ? 'Uploading…' : url ? 'Change photo' : 'Add photo'} kind="ghost" onPress={choose} disabled={busy} />
      <Err msg={err} />
    </View>
  );
}
