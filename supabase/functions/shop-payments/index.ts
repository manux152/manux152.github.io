// Deploy: supabase functions deploy shop-payments
// Admin tools: connection status, Stripe refunds, manual "mark as refunded". Caller needs payments.manage.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient, cors, json, stripeCall, toMinor } from '../_shared/pay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: ok } = await caller.rpc('has_permission', { perm: 'payments.manage' });
  if (!ok) return json({ error: 'Forbidden' }, 403);
  const body = await req.json().catch(() => ({})); const admin = adminClient();
  try {
    if (body.action === 'status') {
      const { data: st } = await admin.from('site_settings').select('value').eq('key', 'site_url').maybeSingle();
      return json({
        site_url_set: typeof st?.value === 'string' && /^https:\/\//.test(st.value),
        stripe: { api_key: !!Deno.env.get('STRIPE_SECRET_KEY'), webhook_secret: !!Deno.env.get('STRIPE_WEBHOOK_SECRET'), webhook_url: `${url}/functions/v1/payment-webhook?provider=stripe` },
        flutterwave: { api_key: !!Deno.env.get('FLUTTERWAVE_SECRET_KEY'), webhook_secret: !!Deno.env.get('FLUTTERWAVE_SECRET_HASH'), webhook_url: `${url}/functions/v1/payment-webhook?provider=flutterwave` },
      });
    }
    const { data: p } = await admin.from('payments').select('*, orders(currency)').eq('id', body.payment_id).maybeSingle();
    if (!p) return json({ error: 'Payment not found' }, 404);
    if (body.action === 'refund') {
      if (p.provider !== 'stripe') return json({ error: 'Refund Flutterwave payments in the Flutterwave dashboard, then press "Mark as refunded".' }, 400);
      if (p.status !== 'succeeded') return json({ error: 'Only successful payments can be refunded' }, 400);
      const left = Number(p.amount) - Number(p.refunded_amount);
      const amount = body.amount ? Math.min(Number(body.amount), left) : left;
      if (!(amount > 0)) return json({ error: 'Nothing left to refund' }, 400);
      await stripeCall('POST', 'refunds', { payment_intent: p.provider_ref, amount: toMinor(amount, p.currency) });
      await admin.rpc('mark_order_refunded', { p_provider: p.provider, p_ref: p.provider_ref, p_amount: Number(p.refunded_amount) + amount });
      return json({ ok: true, refunded: amount });
    }
    if (body.action === 'mark_refunded') {
      await admin.rpc('mark_order_refunded', { p_provider: p.provider, p_ref: p.provider_ref, p_amount: Number(p.amount) });
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
