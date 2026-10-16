import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Input, Chips, Loading, Err } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { money } from '../../lib/money';
import { useLayout } from '../../lib/layout';
import { PageHead } from '../../components/PageHead';
import { colorGroups, productInStock, salePct } from '../../lib/shop';

export default function Shop() {
  const { cols } = useLayout();
  const { settings } = useApp();
  const [q, setQ] = useState(''); const [cat, setCat] = useState<string | null>(null); const [sort, setSort] = useState('new'); const [stock, setStock] = useState(false); const [feat, setFeat] = useState(false);
  const cats = useTable('product_categories', (x) => x.order('sort_order'));
  const { data, loading, error } = useTable('products', (x) => x.eq('is_active', true).order('created_at', { ascending: false }).limit(200).select('*, product_images(url,sort_order), product_variants(stock,is_active,price_delta,color_name,color_hex)'));
  if (settings.shop_enabled === false) return <Screen><H>Shop</H><T muted>The shop is closed for now.</T></Screen>;
  if (loading) return <Loading />;
  const cur = settings.currency ?? 'USD';
  const inStock = productInStock;
  const list = (data as any[]).filter((p) => (!cat || p.category_id === cat) && (!stock || inStock(p)) && (!feat || p.featured)
    && (p.name + ' ' + (p.description ?? '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name) : 0);
  return (
    <Screen><PageHead title="Shop" description="Official club kit and merchandise." /><H>Shop</H><Err msg={error} />
      {settings.spin_enabled !== false && settings.spin_enabled !== 'false' ? <Link href="/spin" asChild><Pressable accessibilityRole="link" accessibilityLabel="Spin the wheel for a chance to win a discount"><Card style={{ borderColor: '#E08A00' }}><T style={{ fontWeight: '800' }}>🎡 Feeling lucky?</T><T muted>Spin the wheel for a chance to win a discount code.</T></Card></Pressable></Link> : null}
      <Input placeholder="Search the shop" value={q} onChangeText={setQ} />
      <Chips options={(cats.data as any[]).map((c) => ({ value: c.id, label: c.name }))} value={cat} onChange={setCat} />
      <Chips options={[{ value: 'new', label: 'Newest' }, { value: 'low', label: 'Price ↑' }, { value: 'high', label: 'Price ↓' }, { value: 'name', label: 'A–Z' }]} value={sort} onChange={(v) => v && setSort(v)} />
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Switch value={stock} onValueChange={setStock} /><T>In stock</T></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Switch value={feat} onValueChange={setFeat} /><T>Featured</T></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
        {list.map((p) => {
          const img = [...(p.product_images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url; const sold = !inStock(p);
          const from = Math.min(p.price, ...((p.product_variants ?? []).filter((v: any) => v.is_active).map((v: any) => p.price + Number(v.price_delta))));
          return (
            <Link key={p.id} href={`/product/${p.slug}`} asChild><Pressable accessibilityRole="link" accessibilityLabel={p.name} style={{ width: `${100 / cols}%`, padding: 6 }}><Card style={{ padding: 0, overflow: 'hidden', opacity: sold ? 0.6 : 1 }}>
              <View style={{ aspectRatio: 1, backgroundColor: '#E6E8EC' }}>{img ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 40 }}>🛍️</T></View>}
                {sold && <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#D64545', borderRadius: 6, paddingHorizontal: 8 }}><T style={{ color: '#fff', fontWeight: '700' }}>Sold out</T></View>}
                {!sold && salePct(p) ? <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#E08A00', borderRadius: 6, paddingHorizontal: 8 }}><T style={{ color: '#fff', fontWeight: '800' }}>−{salePct(p)}%</T></View> : null}</View>
              <View style={{ padding: 10 }}><T style={{ fontWeight: '700' }} numberOfLines={2}>{p.name}</T>
                {colorGroups((p.product_variants ?? []).filter((v: any) => v.is_active)).length > 0 ? <View style={{ flexDirection: 'row', gap: 4, marginVertical: 2 }}>{colorGroups((p.product_variants ?? []).filter((v: any) => v.is_active)).slice(0, 6).map((g) => <View key={g.key} accessibilityLabel={g.name} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: g.hex, borderWidth: 1, borderColor: '#0003', opacity: g.sold ? 0.35 : 1 }} />)}</View> : null}<View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}><T style={{ fontWeight: '800' }}>{money(from, cur)}</T>{salePct(p) ? <T muted style={{ textDecorationLine: 'line-through', fontSize: 13 }}>{money(Number(p.compare_at_price), cur)}</T> : null}</View></View>
            </Card></Pressable></Link>
          );
        })}
      </View>
      {list.length === 0 && <T muted>No products found.</T>}
    </Screen>
  );
}
