import { Redirect } from 'expo-router';
import { Screen, H, T, Card, Loading, fmtDate } from '../components/ui';
import { useTable } from '../lib/useQuery';
import { useApp } from '../lib/app-context';
import { money } from '../lib/money';

export default function MyOrders() {
  const { session } = useApp();
  const { data, loading } = useTable('orders', (q) => (session ? q.eq('user_id', session.user.id).order('created_at', { ascending: false }).select('*, order_items(name,variant_label,quantity)') : q.limit(0)), [session?.user.id]);
  if (!session) return <Redirect href="/login" />;
  if (loading) return <Loading />;
  return (
    <Screen><H>My orders</H>
      {data.length === 0 && <T muted>No orders yet. Orders placed while signed in appear here; others are confirmed by email.</T>}
      {(data as any[]).map((o) => (
        <Card key={o.id}><T style={{ fontWeight: '800' }}>{o.reference} · {o.status}</T><T muted>{fmtDate(o.created_at)} · {money(Number(o.subtotal) + Number(o.delivery_fee), o.currency)}</T>
          {Number(o.discount) > 0 ? <T style={{ color: '#2E9E5B', fontWeight: '700' }}>You saved {money(Number(o.discount), o.currency)}{o.promo_code ? ` with ${o.promo_code}` : o.promo_title ? ` (${o.promo_title})` : ''}</T> : null}
          {(o.order_items ?? []).map((i: any, k: number) => <T key={k}>{i.quantity} × {i.name}{i.variant_label ? ` (${i.variant_label})` : ''}</T>)}</Card>
      ))}
    </Screen>
  );
}
