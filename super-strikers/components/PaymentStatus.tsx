import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Btn, Card, Err, T } from './ui';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';

export const openUrl = (url: string) => (Platform.OS === 'web' ? ((globalThis as any).location.href = url) : Linking.openURL(url));

// Shows an online order's payment state, polls until it is paid, and lets the customer (re)start or re-check the payment.
export function PaymentStatus({ orderId, token, verify, autoStart }: { orderId: string; token: string; verify?: { session_id?: string; transaction_id?: string }; autoStart?: boolean }) {
  const [s, setS] = useState<any | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const tries = useRef(0);
  const load = useCallback(async () => { const { data } = await supabase.rpc('order_payment_status', { p_order: orderId, p_token: token }); if (data) setS(data); return data; }, [orderId, token]);
  const check = useCallback(async (v?: any) => {
    setErr(null);
    if (v?.session_id || v?.transaction_id) await supabase.functions.invoke('create-payment', { body: { action: 'verify', order_id: orderId, pay_token: token, ...v } });
    await load();
  }, [orderId, token, load]);
  const start = useCallback(async () => {
    setErr(null); setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-payment', { body: { action: 'start', order_id: orderId, pay_token: token } });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not start the payment');
    openUrl(data.url);
  }, [orderId, token]);

  useEffect(() => { check(verify); }, []); // eslint-disable-line
  useEffect(() => { if (autoStart) start(); }, []); // eslint-disable-line
  useEffect(() => {
    const h = setInterval(async () => { tries.current++; const d = await load(); if (d?.payment_status === 'paid' || tries.current > 45) clearInterval(h); }, 4000);
    return () => clearInterval(h);
  }, [load]);

  if (!s) return <Card><T muted>Checking your order…</T></Card>;
  const paid = s.payment_status === 'paid' || s.payment_status === 'refunded'; const cancelled = s.status === 'cancelled';
  return (
    <Card style={{ borderColor: paid ? '#2E9E5B' : '#E6E8EC' }}>
      <T style={{ fontWeight: '800', fontSize: 17 }}>{paid ? 'Payment received ✅' : cancelled ? 'Order cancelled' : 'Waiting for payment…'}</T>
      <T>Order {s.reference} · {money(s.total, s.currency)}</T>
      {paid ? <T muted>Thank you! We've emailed your confirmation.</T>
        : cancelled ? <T muted>This order was cancelled (unpaid orders are released after a while). Please place a new order.</T>
        : (<>
          <T muted>{s.payment_status === 'failed' ? 'The payment did not go through. You can try again.' : 'Finish paying in the secure payment page. This screen updates automatically.'}</T>
          <Err msg={err} />
          <Btn title={busy ? 'Opening…' : s.payment_status === 'failed' ? 'Try again' : 'Open payment page'} onPress={start} disabled={busy} />
          <Btn title="I've paid — check again" kind="ghost" onPress={() => check(verify)} />
        </>)}
    </Card>
  );
}
