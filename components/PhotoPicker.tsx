import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { Btn, Err, T } from './ui';
import { pickImage, uploadAsset } from '../lib/upload';

// Photos from phones can be huge or in formats the server rejects (HEIC), so every picture is shrunk to a JPEG first.
async function prepare(a: { uri: string; width?: number; height?: number; mimeType?: string | null }) {
  const MAX = 1200; const long = Math.max(a.width ?? 0, a.height ?? 0);
  const actions = long > MAX ? [{ resize: a.width && a.height && a.width >= a.height ? { width: MAX } : { height: MAX } }] : [];
  const out = await ImageManipulator.manipulateAsync(a.uri, actions as any, { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
  return { ...a, uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg', fileSize: undefined } as any;
}

// Square profile photo: shows the current one (or the new one straight away) and uploads to the given bucket/folder.
export function PhotoPicker({ url, bucket, folder, onUploaded, size = 110 }: { url?: string | null; bucket: string; folder: string; onUploaded: (url: string) => void | Promise<void>; size?: number }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null);
  const choose = async () => {
    setErr(null); setOk(null);
    let a: any;
    try { a = await pickImage(false); } catch (e: any) { return setErr(e?.message ?? 'Could not open your photos.'); }
    if (!a) return;
    setBusy(true);
    try {
      const small = await prepare(a);
      setPreview(small.uri);                                   // show it immediately
      const publicUrl = await uploadAsset(bucket, folder, small);
      await onUploaded(publicUrl);
      setPreview(null); setOk('Photo saved.');
    } catch (e: any) { setPreview(null); setErr(e?.message ?? 'Upload failed. Please try again.'); }
    setBusy(false);
  };
  const shown = preview ?? url;
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E6E8EC', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
        {shown ? <Image key={shown} source={{ uri: shown }} style={{ width: size, height: size }} contentFit="cover" /> : <T muted>No photo</T>}
      </View>
      <Btn title={busy ? 'Uploading…' : url ? 'Change photo' : 'Add photo'} kind="ghost" onPress={choose} disabled={busy} />
      <Err msg={err} />{ok ? <T>{ok}</T> : null}
    </View>
  );
}
