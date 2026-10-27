// Deploy: supabase functions deploy send-newsletter
// Sends a saved newsletter (Admin → Newsletters) to fans and/or members, or a test copy to the person who clicked.
// Needs the permission newsletters.manage, the email setup from Admin → Email design, and site_url in site settings.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient, commonVars, loadContext, logEmails, renderEmail, sendBatch, sendOne, type Msg } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const MAX_RECIPIENTS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type R = { email: string; name: string | null; member: boolean; unsub?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Not signed in' }, 401);
  const { data: allowed } = await caller.rpc('has_permission', { perm: 'newsletters.manage' });
  if (!allowed) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const test = body.action === 'test';
  if (!id || !['test', 'send'].includes(body.action)) return json({ error: 'Unknown request' }, 400);

  const admin = adminClient();
  const ctx = await loadContext(admin);
  if (!ctx.enabled) return json({ error: 'Emails are switched off in Admin → Email design' }, 400);
  const base = (ctx.appUrl || Deno.env.get('SITE_URL') || '').replace(/\/+$/, '');

  const { data: peek } = await admin.from('newsletters').select('*').eq('id', id).maybeSingle();
  if (!peek) return json({ error: 'Newsletter not found' }, 404);
  if (!peek.subject?.trim() || !peek.body?.trim()) return json({ error: 'Add a subject and a message first' }, 400);

  if (test) {
    const m = renderEmail({ subject: peek.subject, body: peek.body }, { ...commonVars(ctx, user.email, null), first_name: 'there' }, ctx.theme, { optOutNote: true });
    try { await sendOne(ctx.theme, { to: user.email, subject: `[Test] ${m.subject}`, html: m.html, text: m.text }); }
    catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
    await logEmails(admin, [{ template_key: 'newsletter', to_email: user.email, subject: `[Test] ${m.subject}`, status: 'sent', kind: 'test', sent_by: user.id }]);
    return json({ sent: 1, test: true });
  }

  if (!/^https?:\/\//i.test(base)) return json({ error: 'Set the website address (site_url) first, so unsubscribe links work' }, 400);

  // Claim it, so a double-click can never send twice.
  const { data: nl } = await admin.from('newsletters').update({ status: 'sending', last_error: null, updated_at: new Date().toISOString() }).eq('id', id).in('status', ['draft', 'failed']).select().maybeSingle();
  if (!nl) return json({ error: 'This newsletter was already sent, or is being sent right now.' }, 409);
  const revert = (msg: string, status = 'draft') => admin.from('newsletters').update({ status, last_error: msg }).eq('id', id);

  const list: R[] = []; const seen = new Set<string>();
  if (nl.audience !== 'fans') {
    const { data } = await admin.from('profiles').select('email,full_name').eq('is_active', true).eq('email_opt_out', false).not('email', 'is', null).limit(MAX_RECIPIENTS + 1);
    for (const p of data ?? []) { const e = String(p.email).trim().toLowerCase(); if (e && !seen.has(e)) { seen.add(e); list.push({ email: e, name: p.full_name, member: true }); } }
  }
  if (nl.audience !== 'members') {
    let q = admin.from('fans').select('email,full_name,unsub_token').eq('status', 'active').limit(MAX_RECIPIENTS + 1);
    if (nl.topic) q = q.contains('interests', [nl.topic]);
    const { data } = await q;
    for (const f of data ?? []) { const e = String(f.email).trim().toLowerCase(); if (e && !seen.has(e)) { seen.add(e); list.push({ email: e, name: f.full_name, member: false, unsub: f.unsub_token }); } }
  }
  if (!list.length) { await revert('No recipients found'); return json({ error: 'No recipients found for that audience.' }, 400); }
  if (list.length > MAX_RECIPIENTS) { await revert('Too many recipients'); return json({ error: `Too many recipients (max ${MAX_RECIPIENTS}).` }, 400); }

  const msgs = list.map((r) => {
    const body = r.member ? nl.body : `${nl.body}\n\n[Unsubscribe from fan club emails]({unsubscribe_url})`;
    const out = renderEmail({ subject: nl.subject, body }, { ...commonVars(ctx, r.email, r.name), unsubscribe_url: r.unsub ? `${base}/unsubscribe?token=${r.unsub}` : '' }, ctx.theme, { optOutNote: r.member });
    return { r, msg: { to: r.email, subject: out.subject, html: out.html, text: out.text } as Msg };
  });

  let sent = 0, failed = 0, lastErr: string | null = null; const rows: any[] = [];
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100);
    let err: string | null = null;
    try { if (chunk.length === 1) await sendOne(ctx.theme, chunk[0].msg); else await sendBatch(ctx.theme, chunk.map((c) => c.msg)); }
    catch (e) { err = String((e as Error).message ?? e); }
    if (err) { failed += chunk.length; lastErr = err; } else sent += chunk.length;
    for (const c of chunk) rows.push({ template_key: 'newsletter', to_email: c.r.email, to_name: c.r.name, subject: c.msg.subject, status: err ? 'failed' : 'sent', error: err, kind: 'bulk', sent_by: user.id });
    if (err && i === 0) { await logEmails(admin, rows); await revert(err, 'failed'); return json({ error: err, sent, failed }, 500); }
    if (i + 100 < msgs.length) await sleep(600);   // stay under the email provider's rate limit
  }
  await logEmails(admin, rows);
  await admin.from('newsletters').update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed, last_error: lastErr }).eq('id', id);
  return json({ sent, failed });
});
