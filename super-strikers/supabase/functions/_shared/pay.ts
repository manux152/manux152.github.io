// Shared payment helpers (Stripe + Flutterwave v3). Secrets live in function secrets, never in the database:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_SECRET_HASH
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
export const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Stripe amounts: whole units for zero-decimal currencies; UGX/ISK are sent as two-decimal (×100); three-decimal currencies end in 0.
const ZERO = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const WHOLE_X100 = new Set(['UGX', 'ISK']);
const THREE = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);
export function toMinor(amount: number, cur: string) {
  const c = cur.toUpperCase();
  if (ZERO.has(c)) return Math.round(amount);
  if (WHOLE_X100.has(c)) return Math.round(amount) * 100;
  if (THREE.has(c)) return Math.round(amount * 100) * 10;
  return Math.round(amount * 100);
}
export function fromMinor(m: number, cur: string) {
  const c = cur.toUpperCase();
  if (ZERO.has(c)) return m;
  if (THREE.has(c)) return m / 1000;
  return m / 100;
}

export async function stripeCall(method: 'GET' | 'POST', path: string, form?: Record<string, string | number>) {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set on the functions');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method, signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${key}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString() : undefined });
  const out = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${out?.error?.message ?? res.status}`);
  return out;
}

export async function flwCall(method: 'GET' | 'POST', path: string, body?: unknown) {
  const key = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY is not set on the functions');
  const res = await fetch(`https://api.flutterwave.com/v3/${path}`, { method, signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.status === 'error') throw new Error(`Flutterwave: ${out?.message ?? res.status}`);
  return out;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
export async function verifyStripeSignature(payload: string, header: string, secret: string, tolerance = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t); const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > tolerance) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => same(s, mac));
}
export const constEq = same;

// Marks the order paid after checking the amount against the order total (done inside mark_order_paid)
export async function settleStripeSession(admin: any, s: any): Promise<string> {
  const orderId = s.metadata?.order_id ?? s.client_reference_id;
  if (!orderId || s.payment_status !== 'paid') return 'ignored';
  const cur = String(s.currency ?? '').toUpperCase();
  const { data } = await admin.rpc('mark_order_paid', { p_order: orderId, p_provider: 'stripe', p_ref: s.payment_intent ?? s.id, p_amount: fromMinor(s.amount_total, cur), p_currency: cur });
  return String(data);
}
export async function settleFlutterwaveTx(admin: any, transactionId: string | number): Promise<string> {
  const out = await flwCall('GET', `transactions/${encodeURIComponent(String(transactionId))}/verify`);
  const d = out.data;
  if (!d || d.status !== 'successful') return 'not_successful';
  const orderId = String(d.tx_ref ?? '').split('_')[0];
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return 'bad_reference';
  const { data } = await admin.rpc('mark_order_paid', { p_order: orderId, p_provider: 'flutterwave', p_ref: String(d.id), p_amount: Number(d.amount), p_currency: String(d.currency) });
  return String(data);
}
