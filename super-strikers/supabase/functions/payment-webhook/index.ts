// Deploy WITHOUT JWT verification: supabase functions deploy payment-webhook --no-verify-jwt
// Stripe:       Dashboard → Developers → Webhooks → endpoint  <project>.supabase.co/functions/v1/payment-webhook?provider=stripe
//               events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
//               then: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Flutterwave:  Dashboard → Settings → Webhooks → URL  <project>.supabase.co/functions/v1/payment-webhook?provider=flutterwave  and a secret hash, then:
//               supabase secrets set FLUTTERWAVE_SECRET_HASH=<that hash>
import { adminClient, constEq, fromMinor, json, settleFlutterwaveTx, settleStripeSession, verifyStripeSignature } from '../_shared/pay.ts';

Deno.serve(async (req) => {
  const provider = new URL(req.url).searchParams.get('provider');
  const raw = await req.text(); const admin = adminClient();
  try {
    if (provider === 'stripe') {
      const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
      if (!secret || !(await verifyStripeSignature(raw, req.headers.get('stripe-signature') ?? '', secret))) return json({ error: 'Bad signature' }, 400);
      const ev = JSON.parse(raw); const o = ev.data?.object ?? {};
      switch (ev.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': await settleStripeSession(admin, o); break;
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired': if (o.metadata?.order_id) await admin.rpc('mark_order_payment_failed', { p_order: o.metadata.order_id }); break;
        case 'charge.refunded': if (o.payment_intent) await admin.rpc('mark_order_refunded', { p_provider: 'stripe', p_ref: o.payment_intent, p_amount: fromMinor(o.amount_refunded ?? 0, String(o.currency ?? 'usd')) }); break;
      }
      return json({ received: true });
    }
    if (provider === 'flutterwave') {
      const hash = Deno.env.get('FLUTTERWAVE_SECRET_HASH');
      if (!hash || !constEq(req.headers.get('verif-hash') ?? '', hash)) return json({ error: 'Bad signature' }, 401);
      const ev = JSON.parse(raw);
      const id = ev.data?.id;
      if (id && (ev.event === 'charge.completed' || ev.data?.status === 'successful')) await settleFlutterwaveTx(admin, id);   // never trusts the body: re-verifies with Flutterwave
      return json({ received: true });
    }
    return json({ error: 'Unknown provider' }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }   // non-200 makes the provider retry
});
