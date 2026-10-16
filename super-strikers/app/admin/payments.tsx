import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Btn, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { money } from '../../lib/money';
import { shareText } from '../../lib/share';

const Dot = ({ ok }: { ok: boolean }) => <T style={{ color: ok ? '#2E9E5B' : '#D64545', fontWeight: '800' }}>{ok ? '● ready' : '● not set up'}</T>;

export default function Payments() {
  const { can } = useApp();
  const [st, setSt] = useState<any | null>(null); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const providers = useTable('payment_providers', (q) => q.order('sort_order'));
  const pays = useTable('payments', (q) => q.order('created_at', { ascending: false }).limit(50).select('*, orders(reference, customer_name, status)'));
  const stuck = useTable('orders', (q) => q.eq('status', 'cancelled').eq('payment_status', 'paid').select('id,reference,customer_name'));
  useEffect(() => { supabase.functions.invoke('shop-payments', { body: { action: 'status' } }).then(({ data, error }) => { if (error || data?.error) setErr(data?.error ?? error?.message); else setSt(data); }); }, []);
  if (!can('payments.manage')) return <Screen><T>No permission.</T></Screen>;
  if (providers.loading || pays.loading) return <Loading />;

  const act = async (action: string, payment_id: string) => {
    setErr(null); setMsg(null);
    const { data, error } = await supabase.functions.invoke('shop-payments', { body: { action, payment_id } });
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Failed');
    setMsg(action === 'refund' ? `Refunded ${data.refunded}.` : 'Marked as refunded.'); await pays.refresh();
  };
  const expire = async () => { setErr(null); const { data, error } = await supabase.rpc('run_expire_unpaid_orders'); if (error) setErr(error.message); else setMsg(`${data} unpaid online order(s) cancelled and returned to stock.`); };
  const copy = async (u: string) => setMsg(await shareText(u));

  return (
    <Screen>
      <H>Payments</H>
      <Card>
        <T style={{ fontWeight: '800' }}>Payment methods</T>
        {(providers.data as any[]).map((p) => <View key={p.key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{p.label}</T><T style={{ fontWeight: '700', color: p.enabled ? '#2E9E5B' : '#888' }}>{p.enabled ? `On · ${p.mode}` : 'Off'}</T></View>)}
        <Link href={'/admin/manage/paymentProviders' as any} asChild><Pressable><T style={{ color: '#2F7FD8', fontWeight: '700' }}>Turn methods on/off & edit wording →</T></Pressable></Link>
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Connections</T>
        {!st ? <T muted>Checking…</T> : (<>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>Website address (site_url)</T><Dot ok={st.site_url_set} /></View>
          {(['stripe', 'flutterwave'] as const).map((k) => (
            <View key={k} style={{ gap: 4, marginTop: 6 }}>
              <T style={{ fontWeight: '700', textTransform: 'capitalize' }}>{k}</T>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T muted>API key</T><Dot ok={st[k].api_key} /></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T muted>{k === 'stripe' ? 'Webhook secret' : 'Webhook secret hash'}</T><Dot ok={st[k].webhook_secret} /></View>
              <Btn title="Copy webhook URL" kind="ghost" onPress={() => copy(st[k].webhook_url)} />
            </View>
          ))}
          <T muted style={{ fontSize: 12 }}>Keys are stored as secure function secrets (see the README), never in the database or app.</T>
        </>)}
      </Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      {(stuck.data as any[]).length > 0 && <Card style={{ borderColor: '#D64545' }}><T style={{ fontWeight: '800', color: '#D64545' }}>Needs attention</T>
        {(stuck.data as any[]).map((o) => <T key={o.id}>Order {o.reference} ({o.customer_name}) was cancelled but is paid — refund it or set the order back to paid.</T>)}</Card>}
      <Btn title="Cancel unpaid online orders past the hold time" kind="ghost" onPress={expire} />
      <H>Recent payments</H>
      {pays.data.length === 0 && <T muted>No online payments yet.</T>}
      {(pays.data as any[]).map((p) => (
        <Card key={p.id}>
          <T style={{ fontWeight: '800', color: p.status === 'succeeded' ? '#2E9E5B' : p.status === 'mismatch' ? '#D64545' : '#888' }}>{p.status.toUpperCase()} · {money(p.amount, p.currency)}</T>
          <T>{p.orders?.reference} · {p.orders?.customer_name} · {p.provider}</T>
          <T muted>{fmtDate(p.created_at)}{Number(p.refunded_amount) > 0 ? ` · refunded ${money(p.refunded_amount, p.currency)}` : ''}</T>
          {p.status === 'mismatch' && <T style={{ color: '#D64545' }}>The amount or currency did not match the order, so it was not applied. Check it in your provider dashboard.</T>}
          {p.status === 'succeeded' && p.provider === 'stripe' && <Btn title="Refund in full" kind="danger" onPress={() => act('refund', p.id)} />}
          {p.status === 'succeeded' && p.provider !== 'stripe' && <Btn title="Mark as refunded (after refunding in the provider dashboard)" kind="ghost" onPress={() => act('mark_refunded', p.id)} />}
        </Card>
      ))}
    </Screen>
  );
}
