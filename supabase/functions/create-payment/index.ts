// Deploy: supabase functions deploy create-payment
// Starts an online payment for an order (action "start") or confirms it with the provider (action "verify").
// The amount always comes from the order in the database — never from the app.
import { adminClient, cors, flwCall, json, settleFlutterwaveTx, settleStripeSession, stripeCall, toMinor } from '../_shared/pay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const orderId = String(body.order_id ?? ''), token = String(body.pay_token ?? '');
  if (!orderId || !token) return json({ error: 'Missing order' }, 400);
  const { data: order } = await admin.from('orders').select('*').eq('id', orderId).eq('pay_token', token).maybeSingle();
  if (!order) return json({ error: 'Order not found' }, 404);

  try {
    if (body.action === 'verify') {
      let result = 'pending';
      if (order.payment_method === 'stripe' && body.session_id) {
        const s = await stripeCall('GET', `checkout/sessions/${encodeURIComponent(String(body.session_id))}`);
        if ((s.metadata?.order_id ?? s.client_reference_id) !== order.id) return json({ error: 'Session does not match this order' }, 400);
        result = await settleStripeSession(admin, s);
      } else if (order.payment_method === 'flutterwave' && body.transaction_id) {
        result = await settleFlutterwaveTx(admin, body.transaction_id);
      }
      return json({ result });
    }

    // ── start a payment
    if (order.payment_status === 'paid') return json({ error: 'This order is already paid' }, 400);
    if (order.status === 'cancelled') return json({ error: 'This order was cancelled — please place a new order' }, 400);
    if (!['pending', 'failed'].includes(order.payment_status)) return json({ error: 'This order does not need an online payment' }, 400);
    const { data: prov } = await admin.from('payment_providers').select('*').eq('key', order.payment_method).eq('enabled', true).maybeSingle();
    if (!prov) return json({ error: 'That payment method is not available' }, 400);
    const { data: st } = await admin.from('site_settings').select('key,value').in('key', ['site_url', 'team_name', 'shop_payment_hold_minutes']);
    const s = Object.fromEntries((st ?? []).map((r: any) => [r.key, r.value]));
    const site = String(s.site_url ?? '').replace(/\/$/, '');
    if (!/^https:\/\//.test(site)) return json({ error: 'The shop owner must set the site_url setting (https://…) before online payments work' }, 400);
    const total = Number(order.subtotal) + Number(order.delivery_fee); const cur = String(order.currency).toUpperCase();
    const back = `${site}/pay-return?order=${order.id}&t=${token}`;
    const team = typeof s.team_name === 'string' ? s.team_name : 'Shop';

    if (prov.kind === 'stripe') {
      const hold = Math.min(1380, Math.max(30, Number(s.shop_payment_hold_minutes ?? 60)));
      const session = await stripeCall('POST', 'checkout/sessions', {
        mode: 'payment', success_url: `${back}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${back}&cancelled=1`,
        customer_email: order.customer_email, client_reference_id: order.id, 'metadata[order_id]': order.id, 'metadata[reference]': order.reference,
        'payment_intent_data[metadata][order_id]': order.id, expires_at: Math.floor(Date.now() / 1000) + hold * 60,
        'line_items[0][quantity]': 1, 'line_items[0][price_data][currency]': cur.toLowerCase(),
        'line_items[0][price_data][unit_amount]': toMinor(total, cur), 'line_items[0][price_data][product_data][name]': `${team} order ${order.reference}` });
      return json({ url: session.url });
    }
    if (prov.kind === 'flutterwave') {
      const out = await flwCall('POST', 'payments', { tx_ref: `${order.id}_${Date.now()}`, amount: total, currency: cur, redirect_url: back,
        customer: { email: order.customer_email, name: order.customer_name, ...(order.customer_phone ? { phonenumber: order.customer_phone } : {}) },
        customizations: { title: team, description: `Order ${order.reference}` }, meta: { order_id: order.id } });
      if (!out.data?.link) throw new Error('Flutterwave did not return a payment link');
      return json({ url: out.data.link });
    }
    return json({ error: 'This method does not use online payment' }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
