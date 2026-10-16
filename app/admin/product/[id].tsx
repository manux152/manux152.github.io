import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { pickImage, uploadAsset } from '../../../lib/upload';
import { COMMON_COLORS, COMMON_SIZES, safeHex, variantLabel, webUrl } from '../../../lib/shop';
import { checkImageUrl, isWebUrl } from '../../../lib/imageTools';

export default function ProductAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useApp();
  const p = useTable('products', (q) => q.eq('id', id), [id]);
  const imgs = useTable('product_images', (q) => q.eq('product_id', id).order('sort_order'), [id]);
  const vars = useTable('product_variants', (q) => q.eq('product_id', id).order('label'), [id]);
  const [colorName, setColorName] = useState(''); const [colorHex, setColorHex] = useState(''); const [size, setSize] = useState(''); const [delta, setDelta] = useState(''); const [stock, setStock] = useState('');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can('shop.manage')) return <Screen><T>No permission.</T></Screen>;
  if (p.loading) return <Loading />;
  const x: any = p.data[0];

  const upload = async () => {
    setErr(null);
    const a = await pickImage(false); if (!a) return;
    if (a.fileSize && a.fileSize > 5 * 1048576) return setErr('Please choose an image under 5 MB.');
    setBusy(true);
    try { const url = await uploadAsset('shop', String(id), a);
      const { error } = await supabase.from('product_images').insert({ product_id: id, url, sort_order: (imgs.data as any[]).length });
      if (error) setErr(error.message); } catch (e: any) { setErr(e.message); }
    setBusy(false); await imgs.refresh();
  };
  const delImg = async (im: any) => {
    await supabase.from('product_images').delete().eq('id', im.id);
    const marker = '/object/public/shop/'; if (im.url.includes(marker)) await supabase.storage.from('shop').remove([decodeURIComponent(im.url.split(marker)[1])]);
    await imgs.refresh();
  };
  const addVariant = async () => {
    setErr(null);
    const label = variantLabel(colorName, size); if (!label) return setErr('Enter a colour and/or a size, e.g. Black and L.');
    if (colorHex && !/^#[0-9a-f]{6}$/i.test(colorHex)) return setErr('Colour code must look like #1A2B3C — or tap a colour above.');
    if (stock.trim() === '' ) return setErr('Enter how many are in stock (0 if none yet). Leave nothing blank so stock is tracked.');
    const { error } = await supabase.from('product_variants').insert({ product_id: id, label, color_name: colorName.trim() || null, color_hex: colorName.trim() ? (colorHex || null) : null, size_label: size.trim() || null, price_delta: delta ? Number(delta) : 0, stock: Number(stock) });
    if (error) return setErr(error.code === '23505' ? 'That colour and size already exists.' : error.message);
    setColorName(''); setColorHex(''); setSize(''); setDelta(''); setStock(''); await vars.refresh();
  };
  const setVariantPicture = async (v: any, how: 'upload' | 'link') => {
    setErr(null);
    try {
      let url: string;
      if (how === 'upload') { const a = await pickImage(false); if (!a) return; if (a.fileSize && a.fileSize > 5 * 1048576) return setErr('Please choose an image under 5 MB.'); setBusy(true); url = await uploadAsset('shop', `${id}/colors`, a); }
      else { const l = (links[v.id] ?? '').trim(); if (!isWebUrl(l)) return setErr('Paste a full picture link starting with https://'); setBusy(true); if (!(await checkImageUrl(l))) { setBusy(false); return setErr('That link did not load as a picture.'); } url = l; }
      await patchVariant(v, { image_url: url }); setLinks((c) => ({ ...c, [v.id]: '' }));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const patchVariant = async (v: any, patch: any) => { await supabase.from('product_variants').update(patch).eq('id', v.id); await vars.refresh(); };
  const delVariant = async (v: any) => { const { error } = await supabase.from('product_variants').delete().eq('id', v.id); if (error) setErr(error.message); await vars.refresh(); };

  return (
    <Screen>
      <H>{x?.name ?? 'Product'}</H>
      <T muted>Edit name, price and description under Admin → Products. Photos and sizes are managed here.</T>
      <H>Photos</H>
      <Btn title={busy ? 'Uploading…' : 'Upload a photo'} onPress={upload} disabled={busy} />
      {(imgs.data as any[]).map((im) => (
        <Card key={im.id}><Image source={{ uri: im.url }} style={{ height: 160, borderRadius: 8 }} contentFit="cover" /><Btn title="Delete" kind="danger" onPress={() => delImg(im)} /></Card>
      ))}
      <T muted>The first photo is the cover.</T>
      <H>Sizes / options</H>
      <T muted>Leave empty if the product has no options (stock is then set on the product). At 0 stock the option shows as sold out and cannot be ordered.</T>
      {(vars.data as any[]).map((v) => (
        <Card key={v.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {v.color_name ? <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: safeHex(v.color_hex), borderWidth: 1, borderColor: '#0004' }} /> : null}
            <T style={{ fontWeight: '700', flex: 1 }}>{v.label}{Number(v.price_delta) ? ` (${Number(v.price_delta) > 0 ? '+' : ''}${v.price_delta})` : ''}</T>
          </View>
          <T muted>Stock: {v.stock == null ? 'unlimited (not tracked)' : v.stock === 0 ? '0 — sold out, customers cannot order it' : v.stock}</T>
          {v.color_name ? (<>
            {webUrl(v.image_url) ? <Image source={{ uri: v.image_url }} style={{ height: 120, borderRadius: 8 }} contentFit="contain" accessibilityLabel={`${v.label} picture`} /> : <T muted>No picture for this colour yet. Customers see the colour swatch instead.</T>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Btn title={v.image_url ? 'Change colour picture' : 'Upload colour picture'} kind="ghost" onPress={() => setVariantPicture(v, 'upload')} disabled={busy} />
              {v.image_url ? <Btn title="Remove picture" kind="ghost" onPress={() => patchVariant(v, { image_url: null })} /> : null}
            </View>
            <Input label="Or paste a picture link" autoCapitalize="none" value={links[v.id] ?? ''} onChangeText={(t) => setLinks((c) => ({ ...c, [v.id]: t }))} placeholder="https://…" />
            <Btn title="Use this link" kind="ghost" onPress={() => setVariantPicture(v, 'link')} disabled={busy || !(links[v.id] ?? '').trim()} />
          </>) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><T>Available</T><Switch value={v.is_active} onValueChange={(a) => patchVariant(v, { is_active: a })} /></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Btn title="+1 stock" kind="ghost" onPress={() => patchVariant(v, { stock: (v.stock ?? 0) + 1 })} />
            <Btn title="−1 stock" kind="ghost" onPress={() => patchVariant(v, { stock: Math.max(0, (v.stock ?? 1) - 1) })} />
            <Btn title="Delete" kind="danger" onPress={() => delVariant(v)} />
          </View>
        </Card>
      ))}
      <Card>
        <T style={{ fontWeight: '800' }}>Add a colour / size</T>
        <T muted>Tap a colour (or type your own), add a size if the item has sizes, and enter the stock. For many colours and sizes at once use Admin → Inventory.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {COMMON_COLORS.map((c) => (
            <Btn key={c.name} title={c.name} kind={colorName === c.name ? 'primary' : 'ghost'} onPress={() => { setColorName(c.name); setColorHex(c.hex); }} />
          ))}
        </View>
        <Input label="Colour name (leave empty if the item has sizes only)" value={colorName} onChangeText={setColorName} />
        {colorName.trim() ? <Input label="Colour code (e.g. #D32F2F)" autoCapitalize="none" value={colorHex} onChangeText={setColorHex} /> : null}
        <T muted>Size</T><Chips options={COMMON_SIZES.map((x) => ({ value: x, label: x }))} value={COMMON_SIZES.includes(size) ? size : null} onChange={(v) => setSize(v ?? '')} />
        <Input label="Size (or type your own, e.g. Age 10-12)" value={size} onChangeText={setSize} />
        <Input label="Price difference (optional, e.g. 2 or -1)" keyboardType="numeric" value={delta} onChangeText={setDelta} />
        <Input label="Stock in hand *" keyboardType="numeric" value={stock} onChangeText={setStock} />
        <Err msg={err} /><Btn title="Add option" onPress={addVariant} />
      </Card>
    </Screen>
  );
}
