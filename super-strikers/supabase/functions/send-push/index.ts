// Deploy:  supabase functions deploy send-push
// Then create a Database Webhook: Database → Webhooks → table notification_queue, event INSERT,
// type "Supabase Edge Functions" → send-push.  (Admin-sent messages also call this function directly;
// the claim step below guarantees each queued message is only delivered once.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';

  // Webhook / service calls are trusted; user calls need notifications.manage
  if (auth !== `Bearer ${serviceKey}`) {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: ok } = await caller.rpc('has_permission', { perm: 'notifications.manage' });
    if (!ok) return json({ error: 'Forbidden' }, 403);
  }

  const payload = await req.json();
  const queueId: string | undefined = payload.queue_id ?? payload.record?.id;
  if (!queueId) return json({ error: 'queue_id required' }, 400);

  const admin = createClient(url, serviceKey);
  // Claim: only one caller can move pending → sending
  const { data: claimed } = await admin.from('notification_queue').update({ status: 'sending' })
    .eq('id', queueId).eq('status', 'pending').select().maybeSingle();
  if (!claimed) return json({ skipped: 'already processed' });

  try {
    let userIds: string[] | null = null;
    if (claimed.audience_role_ids?.length) {
      const { data } = await admin.from('user_roles').select('user_id').in('role_id', claimed.audience_role_ids);
      userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
    }
    let q = admin.from('push_tokens').select('token, user_id, profiles!inner(push_enabled)').eq('profiles.push_enabled', true);
    if (userIds) q = q.in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const { data: tokens, error } = await q;
    if (error) throw error;

    const list = (tokens ?? []).map((t: any) => t.token as string);
    let sent = 0; const dead: string[] = [];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json',
          ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}) },
        body: JSON.stringify(chunk.map((to) => ({ to, title: claimed.title, body: claimed.body, data: claimed.data, sound: 'default' }))),
      });
      const out = await res.json();
      (out.data ?? []).forEach((tk: any, idx: number) => {
        if (tk.status === 'ok') sent++; else if (tk.details?.error === 'DeviceNotRegistered') dead.push(chunk[idx]);
      });
    }
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
    await admin.from('notification_queue').update({ status: 'sent', sent_count: sent, sent_at: new Date().toISOString() }).eq('id', queueId);
    return json({ sent, removed: dead.length });
  } catch (e) {
    await admin.from('notification_queue').update({ status: 'failed', error: String(e) }).eq('id', queueId);
    return json({ error: String(e) }, 500);
  }
});
