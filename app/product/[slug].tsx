import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Chips, Loading } from '../../components/ui';
import { ColorGrid } from '../../components/ColorGrid';
import { ColorPreviewModal } from '../../components/ColorPreviewModal';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { useCart } from '../../lib/cart';
import { money } from '../../lib/money';
import { shareText, pageLink } from '../../lib/share';
import { PageHead } from '../../components/PageHead';
import { Variant, colorGroups, isSold, salePct, uncolored, webUrl } from '../../lib/shop';

export default function Product() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { settings } = useApp(); const cart = useCart(); const router = useRouter();
  const { data, loading } = useTable('products', (q) => q.eq('slug', slug).limit(1).select('*, product_images(url,sort_order), product_variants(*), product_categories(name)'), [slug]);
  const [colorKey, setColorKey] = useState<string | null>(null); const [variant, setVariant] = useState<string | null>(null);
  const [qty, setQty] = useState(1); const [added, setAdded] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState(false); const [shownImg, setShownImg] = useState<string | null>(null);
  if (loading) return <Loading />;
  const p: any = data[0];
  if (!p) return <Screen><T muted>Product not found.</T></Screen>;
  const cur = settings.currency ?? 'USD'; const low = Number(settings.shop_low_stock_threshold ?? 5);
  const imgs = [...(p.product_images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
  const vs: Variant[] = (p.product_variants ?? []).filter((v: Variant) => v.is_active);
  const groups = colorGroups(vs); const plain = uncolored(vs);
  const group = groups.find((g) => g.key === colorKey) ?? null;
  const sel = vs.find((v) => v.id === variant) ?? null;
  const price = p.price + (sel ? Number(sel.price_delta) : 0);
  const allSold = vs.length ? vs.every(isSold) : p.stock != null && p.stock <= 0;
  const stockLeft: number | null = sel ? sel.stock : vs.length ? null : p.stock;
  const selSold = sel ? isSold(sel) : false;
  const hero = shownImg ?? webUrl(group?.image) ?? imgs[0]?.url ?? null;

  const pickColor = (key: string) => {
    setErr(null); setAdded(false); setQty(1); setColorKey(key); const g = groups.find((x) => x.key === key)!;
    setShownImg(g.image);
    // a colour with a single option (no sizes) is selected straight away
    const open = g.variants.filter((v) => !isSold(v));
    setVariant(g.variants.length === 1 ? g.variants[0].id : open.length === 1 && g.variants.every((v) => !(v.size_label ?? '').trim()) ? open[0].id : null);
  };
  const needChoice = vs.length > 0 && !sel;
  const add = () => {
    setErr(null);
    if (allSold) return setErr('This item is sold out.');
    if (groups.length && !group) return setErr('Please tap a colour first.');
    if (needChoice) return setErr(group ? 'Please choose a size.' : 'Please choose an option first.');
    if (selSold || (sel == null && vs.length === 0 && stockLeft != null && stockLeft <= 0)) return setErr('That option is sold out.');
    if (stockLeft != null && qty > stockLeft) return setErr(`Only ${stockLeft} left in stock.`);
    cart.add({ product_id: p.id, variant_id: sel?.id ?? null, qty }); setAdded(true);
  };
  const maxQty = Math.min(20, stockLeft ?? 20);
  return (
    <Screen><PageHead title={p.name} description={p.description} image={hero} />
      {hero ? <Image source={{ uri: hero }} style={{ width: '100%', aspectRatio: 1.2, maxHeight: 420, borderRadius: 12 }} contentFit="cover" accessibilityLabel={`${p.name}${group ? ' in ' + group.name : ''}`} /> : null}
      {imgs.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {imgs.map((i: any) => <Pressable key={i.url} accessibilityRole="button" accessibilityLabel="Show this picture" onPress={() => setShownImg(i.url)}><Image source={{ uri: i.url }} style={{ width: 64, height: 64, borderRadius: 8, opacity: hero === i.url ? 1 : 0.65 }} contentFit="cover" accessibilityLabel="" /></Pressable>)}</ScrollView>}
      {p.product_categories?.name ? <T muted>{p.product_categories.name}</T> : null}
      <H>{p.name}</H>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <T style={{ fontWeight: '800', fontSize: 22 }}>{money(price, cur)}</T>
        {salePct(p) ? <><T muted style={{ textDecorationLine: 'line-through' }}>{money(Number(p.compare_at_price) + (sel ? Number(sel.price_delta) : 0), cur)}</T><View style={{ backgroundColor: '#E08A00', borderRadius: 6, paddingHorizontal: 8 }}><T style={{ color: '#fff', fontWeight: '800' }}>Save {salePct(p)}%</T></View></> : null}
      </View>
      {allSold ? <Card style={{ borderColor: '#D64545' }}><T style={{ color: '#D64545', fontWeight: '800' }}>Sold out</T><T muted>This item is out of stock right now, so it can't be ordered.</T></Card> : null}
      {p.description ? <Card><T>{p.description}</T></Card> : null}

      {groups.length > 0 && (<>
        <T style={{ fontWeight: '700' }}>Colour{group ? `: ${group.name}` : ''}</T>
        <ColorGrid groups={groups} selected={colorKey} onSelect={pickColor} />
        {group ? <Btn title={`See how it looks in ${group.name}`} kind="ghost" onPress={() => setPreview(true)} /> : null}
        {group && (group.variants.length > 1 || (group.variants[0]?.size_label ?? '').trim()) ? (<>
          <T style={{ fontWeight: '700' }}>Size</T>
          <Chips options={group.variants.map((v) => ({ value: v.id, label: `${(v.size_label ?? v.label) || v.label}${isSold(v) ? ' (sold out)' : ''}` }))} value={variant} onChange={(v) => { setVariant(v); setQty(1); setErr(null); setAdded(false); }} />
        </>) : null}
      </>)}
      {plain.length > 0 && (<><T muted>{groups.length ? 'Other options' : 'Choose an option'}</T>
        <Chips options={plain.map((v) => ({ value: v.id, label: `${v.label}${isSold(v) ? ' (sold out)' : ''}` }))} value={plain.some((v) => v.id === variant) ? variant : null} onChange={(v) => { setVariant(v); setColorKey(null); setQty(1); setErr(null); setAdded(false); }} /></>)}

      {stockLeft != null && stockLeft > 0 && stockLeft <= low && <T style={{ color: '#D64545', fontWeight: '700' }}>Only {stockLeft} left</T>}
      {sel && selSold ? <T style={{ color: '#D64545', fontWeight: '700' }}>This option is sold out</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Btn title="−" kind="ghost" onPress={() => setQty(Math.max(1, qty - 1))} disabled={allSold} /><T style={{ fontWeight: '800', fontSize: 18 }}>{qty}</T><Btn title="+" kind="ghost" onPress={() => setQty(Math.min(maxQty, qty + 1))} disabled={allSold || qty >= maxQty} />
      </View>
      {err ? <T style={{ color: '#B3261E' }}>{err}</T> : null}
      <Btn title={allSold ? 'Sold out' : selSold ? 'Option sold out' : 'Add to cart'} onPress={add} disabled={allSold || selSold} />
      {added && <Btn title="View cart" kind="ghost" onPress={() => router.push('/cart')} />}
      <Btn title="Share" kind="ghost" onPress={async () => { await shareText(p.name, { title: p.name, url: pageLink(settings.site_url, '/product/' + p.slug) }); }} />
      {group ? <ColorPreviewModal visible={preview} onClose={() => setPreview(false)} product={p.name} color={group.name} hex={group.hex} image={group.image ?? imgs[0]?.url} note={group.sold ? 'This colour is sold out.' : group.left != null && group.left <= low ? `Only ${group.left} left in this colour.` : null} onChoose={() => pickColor(group.key)} /> : null}
    </Screen>
  );
}
