import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Btn, Card, Err, Input, T } from './ui';
import { checkImageUrl, isWebUrl, pickImages, uploadNewsPicture } from '../lib/imageTools';

export type Picture = { url: string; caption?: string };
export const MAX_NEWS_PICTURES = 12;

/** Add real pictures (upload) or picture links, write captions, pick the cover and reorder. */
export function PictureList({ pictures, cover, onChange }: { pictures: Picture[]; cover: string | null; onChange: (pics: Picture[], cover: string | null) => void }) {
  const [link, setLink] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const room = MAX_NEWS_PICTURES - pictures.length;
  const commit = (pics: Picture[], c: string | null = cover) => onChange(pics, pics.some((p) => p.url === c) ? c : pics[0]?.url ?? null);

  const upload = async () => {
    setErr(null); if (room <= 0) return setErr(`You can add up to ${MAX_NEWS_PICTURES} pictures.`);
    setBusy(true);
    try {
      const picked = await pickImages(room); const added: Picture[] = [];
      for (const a of picked) {
        if (a.fileSize && a.fileSize > 8 * 1048576) { setErr('Pictures over 8 MB were skipped.'); continue; }
        added.push({ url: await uploadNewsPicture(a as any), caption: '' });
      }
      if (added.length) commit([...pictures, ...added]);
    } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  const addLink = async () => {
    setErr(null); const u = link.trim();
    if (room <= 0) return setErr(`You can add up to ${MAX_NEWS_PICTURES} pictures.`);
    if (!isWebUrl(u)) return setErr('Paste a full picture link starting with https://');
    if (pictures.some((p) => p.url === u)) return setErr('That picture is already added.');
    setBusy(true); const ok = await checkImageUrl(u); setBusy(false);
    if (!ok) return setErr('That link did not load as a picture. Check the address or upload the picture instead.');
    commit([...pictures, { url: u, caption: '' }]); setLink('');
  };
  const move = (i: number, d: number) => { const n = [...pictures]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; commit(n); };
  const caption = (i: number, v: string) => commit(pictures.map((p, k) => (k === i ? { ...p, caption: v } : p)));

  return (
    <View style={{ gap: 10 }}>
      <T style={{ fontWeight: '800' }}>Pictures ({pictures.length}/{MAX_NEWS_PICTURES})</T>
      <T muted>Upload pictures from your device or paste picture links. The cover picture shows on the news list and at the top of the story.</T>
      <Btn title={busy ? 'Working…' : 'Upload pictures'} onPress={upload} disabled={busy || room <= 0} />
      <Input label="Or paste a picture link" autoCapitalize="none" keyboardType="url" value={link} onChangeText={setLink} placeholder="https://example.com/photo.jpg" />
      <Btn title="Add this link" kind="ghost" onPress={addLink} disabled={busy || !link.trim()} />
      <Err msg={err} />
      {pictures.map((p, i) => (
        <Card key={p.url}>
          <Image source={{ uri: p.url }} style={{ height: 170, borderRadius: 8 }} contentFit="cover" accessibilityLabel={p.caption || `Picture ${i + 1}`} />
          {cover === p.url ? <T style={{ fontWeight: '800' }}>★ Cover picture</T> : null}
          <Input label="Caption (optional)" value={p.caption ?? ''} onChangeText={(v) => caption(i, v)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cover !== p.url ? <Btn title="Make cover" kind="ghost" onPress={() => commit(pictures, p.url)} /> : null}
            <Btn title="↑" kind="ghost" onPress={() => move(i, -1)} disabled={i === 0} />
            <Btn title="↓" kind="ghost" onPress={() => move(i, 1)} disabled={i === pictures.length - 1} />
            <Btn title="Remove" kind="danger" onPress={() => commit(pictures.filter((_, k) => k !== i))} />
          </View>
        </Card>
      ))}
    </View>
  );
}
