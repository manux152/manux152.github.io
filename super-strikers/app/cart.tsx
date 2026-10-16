import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useCart } from '../lib/cart';
import { money } from '../lib/money';
import { useTable } from '../lib/useQuery';
import { PaymentStatus } from '../components/PaymentStatus';
import { ColorPreviewModal } from '../components/ColorPreviewModal';
import { safeHex, webUrl } from '../lib/shop';

export default function Cart() {
  const { settings, session } = useApp(); const cart = useCart(); const router = useRouter();
  const [prods, setProds] = useState<Record<string, any>>({}); const [loading, setLoading] = useState(true);
  const [name, setName] = useState(''); const [email, setEmail] = useState(session?.user.email ?? ''); const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<string>('pickup'); const [address, setAddress] = useState(''); const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState<any | null>(null);
  const offers = useTable('promotions', (q) => q.is('code', null).order('min_subtotal'));
  const mine = useTable('promotions', (q) => (session ? q.eq('user_id', session.user.id).eq('source', 'spin').order('ends_at') : q.limit(0)), [session?.user.id]);
  const [codeIn, setCodeIn] = useState(''); const [applied, setApplied] = useState<string | null>(null); const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ discount: number; free: boolean; title?: string; code?: string } | null>(null);
  const methods = useTable('payment_providers', (q) => q.eq('enabled', true).order('sort_order'));
  const [pay, setPay] = useState<string | null>(null); const [view, setView] = useState<any | null>(null);
  const cur = settings.currency ?? 'USD'; const fee = Number(settings.shop_delivery_fee ?? 0);

  const ids = [...new Set(cart.lines.map((l) => l.product_id))];
  const loadProds = async () => {
    if (!ids.length) return {} as Record<string, any>;
    const { data } = await supabase.from('products').select('*, product_variants(*), product_images(url,sort_order)').in('id', ids);
    const map = Object.fromEntries((data ?? []).map((p: any) => [p.id, p])); setProds(map); return map;
  };
  useEffect(() => { loadProds().finally(() => setLoading(false)); }, [ids.join(',')]); // eslint-disable-line
  useEffect(() => { if (session) supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle().then(({ data }) => { if (data?.full_name) setName((n) => n || data.full_name); }); }, [session?.user.id]); // eslint-disable-line


  const problemOf = (l: any, p: any, v: any): { text: string; fixTo?: number } | null => {
    if (!p || !p.is_active || (l.variant_id && (!v || !v.is_active))) return { text: 'No longer available' };
    const avail: number | null = l.variant_id ? v.stock : p.stock;
    if (avail != null && avail <= 0) return { text: 'Sold out' };
    if (avail != null && l.qty > avail) return { text: `Only ${avail} left in stock`, fixTo: avail };
    return null;
  };
  const rows = cart.lines.map((l, i) => { const p = prods[l.product_id]; const v = p?.product_variants?.find((x: any) => x.id === l.variant_id); const avail: number | null = p ? (l.variant_id ? v?.stock ?? null : p.stock) : null; return { l, i, p, v, avail, bad: problemOf(l, p, v), unit: p ? p.price + (v ? Number(v.price_delta) : 0) : 0 }; });
  const blocked = rows.some((r) => r.bad);
  const sub = rows.filter((r) => !r.bad).reduce((a, r) => a + r.unit * r.l.qty, 0); const discount = Math.min(sub, quote?.discount ?? 0); const feeNow = method === 'delivery' && !quote?.free ? fee : 0; const total = sub - discount + feeNow;
  useEffect(() => {
    if (sub <= 0) { setQuote(null); return; }
    let live = true;
    supabase.rpc('promo_quote', { p_code: applied, p_subtotal: sub, p_fee: method === 'delivery' ? fee : 0 }).then(({ data }) => {
      if (!live || !data) return;
      if (data.ok === false) { setCodeMsg(data.message ?? 'That code can’t be used.'); setApplied(null); setQuote(null); return; }
      setQuote({ discount: Number(data.discount ?? 0), free: !!data.free_delivery, title: data.title, code: data.code });
    });
    return () => { live = false; };
  }, [sub, applied, method, fee]); // eslint-disable-line
  const applyCode = (c: string) => { setCodeMsg(null); const v = c.trim(); if (!v) return; setApplied(v); setCodeIn(''); };
  // "Add X more to get …" — the closest offer the shopper hasn't unlocked yet
  const live = (p: any) => (!p.starts_at || new Date(p.starts_at) <= new Date()) && (!p.ends_at || new Date(p.ends_at) > new Date());
  const next = (offers.data as any[]).filter((p) => p.is_active && !p.user_id && live(p) && Number(p.min_subtotal) > sub && (p.kind !== 'free_delivery' || method === 'delivery'))[0];
  const myCodes = (mine.data as any[]).filter((p) => p.is_active && p.uses < (p.max_uses ?? 1) && live(p));
  if (done && done.kind !== 'offline') return (
    <Screen><H>Pay for your order</H><PaymentStatus orderId={done.order_id} token={done.pay_token} autoStart />
      <Btn title="Back to the shop" kind="ghost" onPress={() => router.replace('/shop')} /></Screen>);
  if (done) return (
    <Screen><H>Thank you! 🎉</H>
      <Card><T style={{ fontWeight: '800' }}>Order {done.reference}</T><T>Total: {money(done.total, done.currency)}</T>
        <T muted>We've emailed you a confirmation. {settings.shop_payment_instructions ?? ''}</T></Card>
      <Btn title="Back to the shop" onPress={() => router.replace('/shop')} /></Screen>);
  if (loading) return <Loading />;

  const place = async () => {
    setErr(null);
    const fresh = await loadProds();
    const stale = cart.lines.some((l) => { const p = fresh[l.product_id]; return problemOf(l, p, p?.product_variants?.find((x: any) => x.id === l.variant_id)); });
    if (stale) return setErr('Some items in your cart are out of stock. Remove or reduce them to continue.');
    if (!name.trim()) return setErr('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Please enter a valid email.');
    if (method === 'delivery' && address.trim().length < 5) return setErr('Please enter a delivery address.');
    setBusy(true);
    const { data, error } = await supabase.rpc('place_order', { p_items: cart.lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, qty: l.qty })),
      p_name: name.trim(), p_email: email.trim(), p_phone: phone.trim() || null, p_method: method, p_address: address.trim() || null, p_note: note.trim() || null, p_payment: pay ?? ((methods.data as any[])[0]?.key ?? 'offline'), p_code: applied });
    setBusy(false);
    if (error) { await loadProds(); return setErr(error.message); }
    cart.clear(); setDone(data);
  };

  if (cart.lines.length === 0) return <Screen><H>Your cart</H><T muted>Your cart is empty.</T><Btn title="Browse the shop" onPress={() => router.replace('/shop')} /></Screen>;
  return (
    <Screen><H>Your cart</H>
      {blocked && <Card style={{ borderColor: '#D64545' }}><T style={{ color: '#D64545', fontWeight: '800' }}>Some items can't be ordered</T><T muted>Remove or reduce the marked items to place your order.</T></Card>}
      {rows.map((r) => (
        <Card key={r.i} style={r.bad ? { borderColor: '#D64545' } : undefined}>
          <T style={{ fontWeight: '700' }}>{r.p?.name ?? 'Unavailable item'}{r.v && !r.v.color_name ? ` (${r.v.label})` : ''}</T>
          {r.v?.color_name ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`See how it looks in ${r.v.color_name}`} onPress={() => setView(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44 }}>
              <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: safeHex(r.v.color_hex), borderWidth: 1, borderColor: '#0004' }} />
              <T style={{ fontWeight: '600' }}>{r.v.color_name}{r.v.size_label ? ` · ${r.v.size_label}` : ''}</T><T muted style={{ fontSize: 12 }}>Tap to see it</T>
            </Pressable>
          ) : null}
          {r.p ? <T muted>{money(r.unit, cur)} each</T> : null}
          {r.bad ? <T style={{ color: '#D64545', fontWeight: '700' }}>{r.bad.text}</T> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {r.p && !(r.bad && !r.bad.fixTo) ? <><Btn title="−" kind="ghost" onPress={() => cart.setQty(r.i, r.l.qty - 1)} /><T style={{ fontWeight: '800' }}>{r.l.qty}</T><Btn title="+" kind="ghost" disabled={r.avail != null && r.l.qty >= r.avail} onPress={() => cart.setQty(r.i, r.l.qty + 1)} /></> : null}
            {r.bad?.fixTo ? <Btn title={`Set to ${r.bad.fixTo}`} onPress={() => cart.setQty(r.i, r.bad!.fixTo!)} /> : null}
            <View style={{ flex: 1 }} />{!r.bad ? <T style={{ fontWeight: '800' }}>{money(r.unit * r.l.qty, cur)}</T> : null}<Btn title="Remove" kind="ghost" onPress={() => cart.remove(r.i)} />
          </View>
        </Card>
      ))}
      {view ? <ColorPreviewModal visible onClose={() => setView(null)} product={view.p.name} color={view.v.color_name} hex={view.v.color_hex} image={webUrl(view.v.image_url) ?? [...(view.p.product_images ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.url} /> : null}
      {next ? <Card style={{ borderColor: '#2E9E5B' }}>
        <T style={{ fontWeight: '800' }}>Add {money(Number(next.min_subtotal) - sub, cur)} more to unlock {next.title}</T>
        <View accessibilityRole="progressbar" style={{ height: 8, borderRadius: 4, backgroundColor: '#8883', overflow: 'hidden' }}><View style={{ width: `${Math.min(100, (sub / Number(next.min_subtotal)) * 100)}%`, height: 8, backgroundColor: '#2E9E5B' }} /></View>
        <Btn title="Keep shopping" kind="ghost" onPress={() => router.push('/shop')} />
      </Card> : null}
      <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>Subtotal</T><T>{money(sub, cur)}</T></View>
        {discount > 0 ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ color: '#2E9E5B', fontWeight: '700' }}>Discount{quote?.code ? ` (${quote.code})` : quote?.title ? ` · ${quote.title}` : ''}</T><T style={{ color: '#2E9E5B', fontWeight: '700' }}>−{money(discount, cur)}</T></View> : null}
        {method === 'delivery' && fee > 0 ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>Delivery</T><T>{quote?.free ? 'Free' : money(fee, cur)}</T></View> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontWeight: '800' }}>Total</T><T style={{ fontWeight: '800' }}>{money(total, cur)}</T></View></Card>
      <Card>
        <T style={{ fontWeight: '700' }}>Have a discount code?</T>
        {applied && quote ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><T style={{ fontWeight: '800', color: '#2E9E5B' }}>✓ {applied.toUpperCase()} applied</T><Btn title="Remove" kind="ghost" onPress={() => { setApplied(null); setCodeMsg(null); }} /></View> : (
          <><Input label="Code" autoCapitalize="characters" value={codeIn} onChangeText={setCodeIn} placeholder="e.g. SPIN-1A2B3C4D" /><Btn title="Apply code" kind="ghost" onPress={() => applyCode(codeIn)} disabled={!codeIn.trim()} /></>)}
        {codeMsg ? <T style={{ color: '#B3261E' }}>{codeMsg}</T> : null}
        {!applied && myCodes.length > 0 ? <><T muted>Your prizes</T>{myCodes.map((p) => <Btn key={p.id} title={`${p.title.replace('Spin & win: ', '')} · ${p.code}`} kind="ghost" onPress={() => applyCode(p.code)} />)}</> : null}
        {!applied && !session && settings.spin_enabled !== false ? <T muted style={{ fontSize: 12 }}>Sign in and spin the wheel for a chance to win a code.</T> : null}
      </Card>
      <H>Your details</H>
      <Input label="Full name *" value={name} onChangeText={setName} />
      <Input label="Email *" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Input label="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <Chips options={[{ value: 'pickup', label: 'Collect from the club' }, { value: 'delivery', label: 'Delivery' }]} value={method} onChange={(v) => v && setMethod(v)} />
      {method === 'delivery' && <Input label="Delivery address *" multiline value={address} onChangeText={setAddress} />}
      <Input label="Note (optional)" multiline value={note} onChangeText={setNote} />
      <H>Payment</H>
      {(methods.data as any[]).length > 1 && <Chips options={(methods.data as any[]).map((m) => ({ value: m.key, label: m.label }))} value={pay ?? (methods.data as any[])[0]?.key} onChange={(v) => v && setPay(v)} />}
      <Card><T muted>{(methods.data as any[]).find((m) => m.key === (pay ?? (methods.data as any[])[0]?.key))?.instructions ?? 'The team will tell you how to pay.'}</T></Card>
      <Err msg={err} /><Btn title={busy ? 'Placing order…' : ((methods.data as any[]).find((m) => m.key === (pay ?? (methods.data as any[])[0]?.key))?.kind ?? 'offline') === 'offline' ? 'Place order' : 'Continue to payment'} onPress={place} disabled={busy || blocked} />
      {blocked ? <T muted>Ordering is paused until the marked items are removed or reduced.</T> : null}
    </Screen>
  );
}
