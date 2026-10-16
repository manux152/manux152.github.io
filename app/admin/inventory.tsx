import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading, fmtDate } from '../../components/ui';
import { ColorPreviewModal } from '../../components/ColorPreviewModal';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { COMMON_COLORS, COMMON_SIZES, safeHex, variantLabel, webUrl } from '../../lib/shop';

type Row = { key: string; productId: string; variantId: string | null; label: string; hex: string | null; color: string | null; image: string | null; stock: number | null };
const FILTERS = [{ value: 'all', label: 'All' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Sold out' }, { value: 'untracked', label: 'Not tracked' }];

// Admin → Inventory: see every item's stock, change many at once, add colours and sizes in bulk, and review recent stock movements.
export default function Inventory() {
  const { can, settings } = useApp();
  const prods = useTable('products', (q) => q.order('name').select('*, product_variants(*), product_images(url,sort_order)'));
  const log = useTable('inventory_log', (q) => q.order('created_at', { ascending: false }).limit(25));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const [amount, setAmount] = useState('');
  const [open, setOpen] = useState<string | null>(null); const [view, setView] = useState<{ p: string; r: Row } | null>(null);
  const [colors, setColors] = useState<string[]>([]); const [sizes, setSizes] = useState<string[]>([]); const [custom, setCustom] = useState(''); const [customHex, setCustomHex] = useState(''); const [startStock, setStartStock] = useState('10');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const low = Number(settings.shop_low_stock_threshold ?? 5);

  const products = useMemo(() => (prods.data as any[]).map((p) => {
    const vs: any[] = [...(p.product_variants ?? [])].sort((a, b) => a.label.localeCompare(b.label));
    const img = [...(p.product_images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url ?? null;
    const rows: Row[] = vs.length ? vs.map((v) => ({ key: `v:${v.id}`, productId: p.id, variantId: v.id, label: v.label, hex: v.color_hex, color: v.color_name, image: v.image_url ?? img, stock: v.stock }))
      : [{ key: `p:${p.id}`, productId: p.id, variantId: null, label: 'Whole product', hex: null, color: null, image: img, stock: p.stock }];
    return { p, rows };
  }), [prods.data]);

  if (!can('shop.manage')) return <Screen><T>No permission.</T></Screen>;
  if (prods.loading) return <Loading />;

  const cur = (r: Row): number | null => { const e = edits[r.key]; if (e === undefined) return r.stock; return e.trim() === '' ? null : Number(e); };
  const status = (n: number | null) => (n == null ? 'untracked' : n <= 0 ? 'out' : n <= low ? 'low' : 'ok');
  const all = products.flatMap((x) => x.rows);
  const counts = { out: all.filter((r) => status(cur(r)) === 'out').length, low: all.filter((r) => status(cur(r)) === 'low').length, untracked: all.filter((r) => status(cur(r)) === 'untracked').length, units: all.reduce((a, r) => a + (cur(r) ?? 0), 0) };
  const match = (r: Row, name: string) => (filter === 'all' || status(cur(r)) === filter) && (name + ' ' + r.label).toLowerCase().includes(q.toLowerCase());
  const shown = products.map((x) => ({ ...x, rows: x.rows.filter((r) => match(r, x.p.name)) })).filter((x) => x.rows.length);
  const visibleRows = shown.flatMap((x) => x.rows);
  const dirty = Object.keys(edits).filter((k) => { const r = all.find((x) => x.key === k); return r && cur(r) !== r.stock; });
  const setEdit = (r: Row, v: string) => setEdits((c) => ({ ...c, [r.key]: v }));
  const nudge = (r: Row, d: number) => setEdit(r, String(Math.max(0, (cur(r) ?? 0) + d)));
  const bulk = (mode: 'set' | 'add' | 'out') => {
    setErr(null); const n = Number(amount);
    if (mode !== 'out' && (amount.trim() === '' || !Number.isInteger(n) || n < 0)) return setErr('Enter a whole number first.');
    if (!visibleRows.length) return setErr('No items match the filter.');
    setEdits((c) => { const nx = { ...c }; visibleRows.forEach((r) => { nx[r.key] = String(mode === 'out' ? 0 : mode === 'set' ? n : Math.max(0, (cur(r) ?? 0) + n)); }); return nx; });
  };
  const save = async () => {
    setErr(null); setMsg(null);
    const changes: any[] = [];
    for (const k of dirty) {
      const r = all.find((x) => x.key === k)!; const v = cur(r);
      if (v != null && (!Number.isInteger(v) || v < 0)) return setErr(`${r.label}: stock must be a whole number, 0 or more.`);
      changes.push({ ...(r.variantId ? { variant_id: r.variantId } : { product_id: r.productId }), stock: v, mode: 'set' });
    }
    if (!changes.length) return;
    setBusy(true);
    const { error } = await supabase.rpc('bulk_update_stock', { p_changes: changes, p_reason: 'bulk' });
    setBusy(false);
    if (error) return setErr(error.message);
    setEdits({}); setMsg(`Saved ${changes.length} stock change${changes.length === 1 ? '' : 's'}.`); await prods.refresh(); await log.refresh();
  };
  const create = async (productId: string) => {
    setErr(null); setMsg(null);
    const cs = [...colors.map((n) => COMMON_COLORS.find((c) => c.name === n)!), ...(custom.trim() ? [{ name: custom.trim(), hex: /^#[0-9a-f]{6}$/i.test(customHex) ? customHex : '#9AA3AE' }] : [])];
    if (!cs.length && !sizes.length) return setErr('Choose at least one colour or size.');
    const n = Number(startStock); if (startStock.trim() === '' || !Number.isInteger(n) || n < 0) return setErr('Enter the starting stock for each new option (0 or more).');
    const rows: any[] = [];
    for (const c of cs.length ? cs : [null]) for (const s of sizes.length ? sizes : [null]) {
      rows.push({ product_id: productId, label: variantLabel(c?.name, s), color_name: c?.name ?? null, color_hex: c?.hex ?? null, size_label: s, stock: n });
    }
    setBusy(true);
    const { error } = await supabase.from('product_variants').upsert(rows, { onConflict: 'product_id,label', ignoreDuplicates: true });
    setBusy(false);
    if (error) return setErr(error.message);
    setColors([]); setSizes([]); setCustom(''); setCustomHex(''); setOpen(null); setMsg(`Added ${rows.length} option${rows.length === 1 ? '' : 's'} (existing ones were left unchanged).`); await prods.refresh(); await log.refresh();
  };
  const badge = (n: number | null) => { const s = status(n); return { out: ['Sold out', '#D64545'], low: ['Low', '#E08A00'], untracked: ['Not tracked', '#7A8490'], ok: ['In stock', '#2E9E5B'] }[s] as [string, string]; };

  return (
    <Screen>
      <H>Inventory</H>
      <T muted>Customers can't order anything at 0 stock. Items with a blank stock aren't tracked and can always be ordered — give them a number to track them.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[['Sold out', counts.out, '#D64545'], [`Low (≤${low})`, counts.low, '#E08A00'], ['Not tracked', counts.untracked, '#7A8490'], ['Units in stock', counts.units, '#2E9E5B']].map(([l, n, c]) => (
          <Card key={String(l)} style={{ flexGrow: 1, minWidth: 130, borderColor: c as string }}><T style={{ fontWeight: '900', fontSize: 22, color: c as string }}>{String(n)}</T><T muted style={{ fontSize: 12 }}>{String(l)}</T></Card>
        ))}
      </View>
      <Input placeholder="Search products, colours, sizes" value={q} onChangeText={setQ} />
      <Chips options={FILTERS} value={filter} onChange={(v) => setFilter(v ?? 'all')} />
      <Card>
        <T style={{ fontWeight: '800' }}>Bulk update ({visibleRows.length} shown)</T>
        <T muted style={{ fontSize: 12 }}>Applies to the items currently shown (use search and filters to narrow them). Nothing is saved until you press Save.</T>
        <Input label="Number" keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder="e.g. 10" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn title="Set all to this number" kind="ghost" onPress={() => bulk('set')} /><Btn title="Add this number to all" kind="ghost" onPress={() => bulk('add')} /><Btn title="Mark all sold out" kind="ghost" onPress={() => bulk('out')} />
        </View>
      </Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn title={busy ? 'Saving…' : `Save changes (${dirty.length})`} onPress={save} disabled={busy || dirty.length === 0} />
        {dirty.length > 0 ? <Btn title="Discard" kind="ghost" onPress={() => setEdits({})} /> : null}
      </View>
      {shown.length === 0 && <T muted>Nothing matches. Add products under Admin → Shop products first.</T>}
      {shown.map(({ p, rows }) => (
        <Card key={p.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T style={{ fontWeight: '800', flex: 1 }}>{p.name}{p.is_active ? '' : ' (hidden)'}</T>
            <Link href={`/admin/product/${p.id}` as any} asChild><Pressable accessibilityRole="link"><T muted style={{ fontSize: 12 }}>Pictures & options →</T></Pressable></Link>
          </View>
          {rows.map((r) => {
            const n = cur(r); const [bl, bc] = badge(n); const changed = n !== r.stock;
            return (
              <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#8883' }}>
                {r.color ? <Pressable accessibilityRole="button" accessibilityLabel={`See ${r.color}`} onPress={() => setView({ p: p.name, r })} style={{ padding: 4 }}><View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: safeHex(r.hex), borderWidth: 1, borderColor: '#0004' }} /></Pressable> : null}
                <View style={{ flex: 1, minWidth: 110 }}><T style={{ fontWeight: '600' }}>{r.label}</T><T style={{ color: bc, fontSize: 12, fontWeight: '700' }}>{bl}{changed ? ' · unsaved' : ''}</T></View>
                <Btn title="−" kind="ghost" onPress={() => nudge(r, -1)} />
                <View style={{ width: 76 }}><Input accessibilityLabel={`Stock for ${p.name} ${r.label}`} keyboardType="numeric" value={edits[r.key] ?? (r.stock == null ? '' : String(r.stock))} placeholder="∞" onChangeText={(t) => setEdit(r, t.replace(/[^0-9]/g, ''))} /></View>
                <Btn title="+" kind="ghost" onPress={() => nudge(r, 1)} /><Btn title="+10" kind="ghost" onPress={() => nudge(r, 10)} />
              </View>
            );
          })}
          <Btn title={open === p.id ? 'Close' : 'Add colours & sizes in bulk'} kind="ghost" onPress={() => { setOpen(open === p.id ? null : p.id); setErr(null); }} />
          {open === p.id && (
            <View style={{ gap: 8 }}>
              <T muted>Colours (tap to select)</T>
              <Chips multi options={COMMON_COLORS.map((c) => ({ value: c.name, label: c.name }))} value={colors} onChange={setColors} />
              <Input label="Another colour (optional)" value={custom} onChangeText={setCustom} />
              {custom.trim() ? <Input label="Its colour code (e.g. #A52A2A)" autoCapitalize="none" value={customHex} onChangeText={setCustomHex} /> : null}
              <T muted>Sizes (optional)</T>
              <Chips multi options={COMMON_SIZES.map((x) => ({ value: x, label: x }))} value={sizes} onChange={setSizes} />
              <Input label="Starting stock for each new option" keyboardType="numeric" value={startStock} onChangeText={setStartStock} />
              <Btn title={busy ? 'Adding…' : 'Create these options'} onPress={() => create(p.id)} disabled={busy} />
            </View>
          )}
        </Card>
      ))}
      <Card>
        <T style={{ fontWeight: '800' }}>Recent stock movements</T>
        {(log.data as any[]).length === 0 && <T muted>No movements yet.</T>}
        {(log.data as any[]).map((l) => (
          <T key={l.id} style={{ fontSize: 13 }}>{fmtDate(l.created_at)} · {l.item_label} · {l.delta == null ? `set to ${l.new_stock ?? 'not tracked'}` : `${l.delta > 0 ? '+' : ''}${l.delta} → ${l.new_stock}`} <T muted style={{ fontSize: 12 }}>({l.reason})</T></T>
        ))}
      </Card>
      {view ? <ColorPreviewModal visible onClose={() => setView(null)} product={view.p} color={view.r.color ?? view.r.label} hex={view.r.hex} image={webUrl(view.r.image)} /> : null}
    </Screen>
  );
}
