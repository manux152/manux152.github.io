import { useState } from 'react';
import { Screen, H, T, Card, Btn, Chips, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { money } from '../../lib/money';

const STATUSES = ['new', 'paid', 'ready', 'completed', 'cancelled'];

export default function AdminOrders() {
  const { can } = useApp();
  const [filter, setFilter] = useState<string | null>('new'); const [err, setErr] = useState<string | null>(null);
  const orders = useTable('orders', (q) => { let x = q.order('created_at', { ascending: false }).limit(100).select('*, order_items(name,variant_label,quantity,unit_price)'); if (filter) x = x.eq('status', filter); return x; }, [filter]);
  if (!can('orders.manage')) return <Screen><T>No permission.</T></Screen>;
  if (orders.loading) return <Loading />;
  const setStatus = async (o: any, s: string | null) => {
    if (!s || s === o.status) return;
    const { error } = await supabase.from('orders').update({ status: s }).eq('id', o.id);
    if (error) setErr(error.message); await orders.refresh();
  };
  return (
    <Screen><H>Shop orders</H>
      <T muted>Payment is collected offline. Mark an order <T style={{ fontWeight: '700' }}>paid</T> when money is received — the customer is emailed on every status change. Cancelling returns the items to stock.</T>
      <Chips options={STATUSES.map((s) => ({ value: s, label: s }))} value={filter} onChange={setFilter} />
      <Err msg={err} />
      {orders.data.length === 0 && <T muted>No orders here.</T>}
      {(orders.data as any[]).map((o) => (
        <Card key={o.id}>
          <T style={{ fontWeight: '800' }}>{o.reference} · {money(Number(o.subtotal) + Number(o.delivery_fee), o.currency)}</T>
          {Number(o.discount) > 0 ? <T muted>Discount {money(Number(o.discount), o.currency)}{o.promo_code ? ` (${o.promo_code})` : o.promo_title ? ` (${o.promo_title})` : ''}</T> : null}
          <T muted>{fmtDate(o.created_at)} · {o.payment_method} · <T style={{ fontWeight: '700', color: o.payment_status === 'paid' ? '#2E9E5B' : o.payment_status === 'failed' ? '#D64545' : '#888' }}>{o.payment_status}</T></T>
          <T>{o.customer_name} · {o.customer_email}{o.customer_phone ? ` · ${o.customer_phone}` : ''}</T>
          <T muted>{o.delivery_method === 'delivery' ? `Delivery: ${o.address}` : 'Collect from the club'}</T>
          {(o.order_items ?? []).map((i: any, k: number) => <T key={k}>{i.quantity} × {i.name}{i.variant_label ? ` (${i.variant_label})` : ''} — {money(i.unit_price * i.quantity, o.currency)}</T>)}
          {o.note ? <T muted>Note: {o.note}</T> : null}
          <Chips options={STATUSES.map((s) => ({ value: s, label: s }))} value={o.status} onChange={(v) => setStatus(o, v)} />
        </Card>
      ))}
    </Screen>
  );
}
