import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Chips, Err, T } from './ui';
import { BrandingFolder, EditOp, canEditImages, editImage, removeBranding, uploadBranding } from '../lib/imageTools';

const ASPECTS = [{ value: '1.7778', label: '16:9' }, { value: '2.3333', label: '21:9' }, { value: '1.3333', label: '4:3' }, { value: '1', label: 'Square' }, { value: '3', label: 'Banner 3:1' }];
const ZOOMS = [{ value: '1', label: '100%' }, { value: '1.25', label: '125%' }, { value: '1.5', label: '150%' }, { value: '2', label: '200%' }];
const H_POS = [{ value: '0', label: 'Left' }, { value: '0.5', label: 'Center' }, { value: '1', label: 'Right' }];
const V_POS = [{ value: '0', label: 'Top' }, { value: '0.5', label: 'Middle' }, { value: '1', label: 'Bottom' }];

/** Rotate / flip / crop an already-uploaded picture. Each action saves a new copy and tells the parent the new address. */
export function ImageEditTools({ url, folder, format = 'jpeg', aspects, onChange }: { url: string; folder: BrandingFolder; format?: 'jpeg' | 'png'; aspects?: string[]; onChange: (newUrl: string) => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [aspect, setAspect] = useState<string | null>(aspects?.[0] ?? '1.7778'); const [zoom, setZoom] = useState<string | null>('1');
  const [fx, setFx] = useState<string | null>('0.5'); const [fy, setFy] = useState<string | null>('0.5');
  const list = ASPECTS.filter((a) => !aspects || aspects.includes(a.value));
  if (!canEditImages) return <T muted>Picture editing (rotate, flip, crop) needs one more package. In the project folder run: npx expo install expo-image-manipulator — then restart the app.</T>;
  const run = async (op: EditOp) => {
    setErr(null); setBusy(true);
    try {
      const out = await editImage(url, [op], format); const next = await uploadBranding(folder, out);
      await removeBranding(url); onChange(next);
    } catch (e: any) { setErr(`Couldn't edit this picture here (${e?.message ?? 'unknown error'}). Remove it and add the edited picture instead.`); }
    setBusy(false);
  };
  return (
    <View style={{ gap: 8 }}>
      <T muted style={{ fontWeight: '700' }}>Edit picture</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn title="⟲ Rotate left" kind="ghost" disabled={busy} onPress={() => run({ type: 'rotate', deg: -90 })} />
        <Btn title="⟳ Rotate right" kind="ghost" disabled={busy} onPress={() => run({ type: 'rotate', deg: 90 })} />
        <Btn title="⇆ Flip" kind="ghost" disabled={busy} onPress={() => run({ type: 'flip', dir: 'h' })} />
        <Btn title="⇅ Flip upside down" kind="ghost" disabled={busy} onPress={() => run({ type: 'flip', dir: 'v' })} />
      </View>
      <T muted>Crop shape</T><Chips options={list} value={aspect} onChange={(v) => v && setAspect(v)} />
      <T muted>Zoom in</T><Chips options={ZOOMS} value={zoom} onChange={(v) => v && setZoom(v)} />
      <T muted>Crop from (horizontal)</T><Chips options={H_POS} value={fx} onChange={(v) => v && setFx(v)} />
      <T muted>Crop from (vertical)</T><Chips options={V_POS} value={fy} onChange={(v) => v && setFy(v)} />
      <Btn title={busy ? 'Working…' : 'Apply crop'} disabled={busy} onPress={() => run({ type: 'crop', aspect: Number(aspect), zoom: Number(zoom), fx: Number(fx), fy: Number(fy) })} />
      <T muted style={{ fontSize: 12 }}>Editing saves a new copy of the picture. Press Save at the bottom to publish your changes.</T>
      <Err msg={err} />
    </View>
  );
}
