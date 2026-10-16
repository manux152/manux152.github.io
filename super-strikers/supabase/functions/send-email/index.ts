// Deploy: supabase functions deploy send-email
// Secret:  supabase secrets set RESEND_API_KEY=re_...      (sender address is set in Admin → Email design)
// Webhook: Dashboard → Database → Webhooks → table email_queue, INSERT → this function (delivers the automatic emails).
// Also used by the admin app for manual / bulk sends and test emails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient, commonVars, loadContext, logEmails, renderEmail, sendBatch, sendOne, SAMPLE_VARS, type Ctx, type Msg } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const MAX_RECIPIENTS = 500;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type R = { email: string; name?: string | null; account: boolean; optedOut?: boolean };

async function processQueue(admin: any, ctx: Ctx, id: string) {
  const { data: q } = await admin.from('email_queue').update({ status: 'sending' }).eq('id', id).eq('status', 'pending').select().maybeSingle();
  if (!q) return json({ skipped: 'already processed' });
  const bulkList: { email: string; name?: string | null }[] = Array.isArray(q.recipients) ? q.recipients : [];
  const fail = async (msg: string) => {
    await admin.from('email_queue').update({ status: 'failed', error: msg }).eq('id', id);
    await logEmails(admin, (bulkList.length ? bulkList : [{ email: q.to_email, name: q.to_name }]).map((r) => ({ template_key: q.template_key, to_email: r.email, to_name: r.name ?? null, status: 'failed', error: msg, kind: 'auto' })));
    return json({ error: msg }, 500);
  };
  try {
    if (!ctx.enabled) return await fail('Emails are switched off in Email design');
    const { data: tpl } = await admin.from('email_templates').select('*').eq('event_key', q.template_key).maybeSingle();
    if (!tpl) return await fail('Template not found');
    if (bulkList.length) {
      const items = bulkList.filter((r) => r.email && EMAIL_RE.test(r.email)).map((r) => {
        const out = renderEmail(tpl, { ...commonVars(ctx, r.email, r.name), ...(q.vars ?? {}) }, ctx.theme, { optOutNote: true });
        return { r, msg: { to: r.email, subject: out.subject, html: out.html, text: out.text } as Msg };
      });
      for (let i = 0; i < items.length; i += 100) {
        const chunk = items.slice(i, i + 100);
        if (chunk.length === 1) await sendOne(ctx.theme, chunk[0].msg); else await sendBatch(ctx.theme, chunk.map((c) => c.msg));
      }
      await admin.from('email_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
      await logEmails(admin, items.map((c) => ({ template_key: q.template_key, to_email: c.r.email, to_name: c.r.name ?? null, subject: c.msg.subject, status: 'sent', kind: 'auto' })));
      return json({ sent: items.length });
    }
    const m = renderEmail(tpl, q.vars ?? {}, ctx.theme);
    await sendOne(ctx.theme, { to: q.to_email, subject: m.subject, html: m.html, text: m.text });
    await admin.from('email_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
    await logEmails(admin, [{ template_key: q.template_key, to_email: q.to_email, to_name: q.to_name, subject: m.subject, status: 'sent', kind: 'auto' }]);
    return json({ sent: 1 });
  } catch (e) { return await fail(String((e as Error).message ?? e)); }
}

async function resolveAudience(admin: any, aud: any, caller: { id: string; email: string }): Promise<{ list: R[]; bulk: boolean }> {
  const fromProfiles = (rows: any[]): R[] => rows.filter((p) => p.email && p.is_active).map((p) => ({ email: p.email, name: p.full_name, account: true, optedOut: p.email_opt_out }));
  switch (aud?.type) {
    case 'self': {
      const { data: p } = await admin.from('profiles').select('full_name').eq('id', caller.id).maybeSingle();
      return { list: [{ email: caller.email, name: p?.full_name, account: true }], bulk: false };
    }
    case 'emails':
      return { list: (aud.recipients ?? []).filter((r: any) => EMAIL_RE.test(String(r.email ?? '').trim())).map((r: any) => ({ email: String(r.email).trim(), name: r.name ?? null, account: false })), bulk: false };
    case 'users': {
      const ids: string[] = aud.user_ids ?? [];
      const { data } = await admin.from('profiles').select('email,full_name,is_active,email_opt_out').in('id', ids);
      return { list: fromProfiles(data ?? []), bulk: ids.length > 1 };
    }
    case 'roles': {
      const { data: ur } = await admin.from('user_roles').select('user_id').in('role_id', aud.role_ids ?? []);
      const ids = [...new Set((ur ?? []).map((r: any) => r.user_id))];
      const { data } = ids.length ? await admin.from('profiles').select('email,full_name,is_active,email_opt_out').in('id', ids) : { data: [] };
      return { list: fromProfiles(data ?? []), bulk: true };
    }
    case 'all_users': {
      const { data } = await admin.from('profiles').select('email,full_name,is_active,email_opt_out').eq('is_active', true).limit(MAX_RECIPIENTS + 1);
      return { list: fromProfiles(data ?? []), bulk: true };
    }
    case 'tryout': {
      let q = admin.from('tryout_applications').select('applicant_email,applicant_name,status').eq('tryout_id', aud.tryout_id);
      if (aud.statuses?.length) q = q.in('status', aud.statuses);
      const { data } = await q;
      return { list: (data ?? []).map((a: any) => ({ email: a.applicant_email, name: a.applicant_name, account: false })), bulk: true };
    }
    default: throw new Error('Choose who to send to');
  }
}

async function manual(admin: any, ctx: Ctx, m: any, caller: { id: string; email: string }) {
  if (!ctx.enabled) return json({ error: 'Emails are switched off in Email design' }, 400);
  let tpl: any = m.custom ?? null; let key: string | null = null;
  if (m.template_key) {
    const { data } = await admin.from('email_templates').select('*').eq('event_key', m.template_key).maybeSingle();
    if (!data) return json({ error: 'Template not found' }, 400);
    tpl = data; key = data.event_key;
  }
  if (!tpl?.subject?.trim() || !tpl?.body?.trim()) return json({ error: 'Add a subject and message' }, 400);
  const { list, bulk } = await resolveAudience(admin, m.audience, caller);
  if (!list.length) return json({ error: 'No recipients found' }, 400);
  if (list.length > MAX_RECIPIENTS) return json({ error: `Too many recipients (max ${MAX_RECIPIENTS}). Narrow the audience.` }, 400);

  const kind = m.test ? 'test' : (bulk ? 'bulk' : 'manual');
  const msgs: { msg: Msg; r: R }[] = []; let skipped = 0; const seen = new Set<string>();
  for (const r of list) {
    const e = r.email.toLowerCase();
    if (seen.has(e)) continue; seen.add(e);
    if (bulk && r.account && r.optedOut) { skipped++; continue; }
    const vars = { ...commonVars(ctx, r.email, r.name), ...(m.sample ? SAMPLE_VARS : {}) };
    const out = renderEmail(tpl, vars, ctx.theme, { optOutNote: bulk && r.account });
    msgs.push({ r, msg: { to: r.email, subject: (m.test ? '[Test] ' : '') + out.subject, html: out.html, text: out.text } });
  }
  let sent = 0, failed = 0; const rows: any[] = [];
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100);
    let err: string | null = null;
    try { if (chunk.length === 1) await sendOne(ctx.theme, chunk[0].msg); else await sendBatch(ctx.theme, chunk.map((c) => c.msg)); }
    catch (e) { err = String((e as Error).message ?? e); }
    err ? failed += chunk.length : sent += chunk.length;
    for (const c of chunk) rows.push({ template_key: key, to_email: c.r.email, to_name: c.r.name ?? null, subject: c.msg.subject, status: err ? 'failed' : 'sent', error: err, kind, sent_by: caller.id });
    if (err && i === 0) { await logEmails(admin, rows); return json({ error: err, sent, failed, skipped }, 500); }
  }
  await logEmails(admin, rows);
  return json({ sent, failed, skipped });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  const body = await req.json().catch(() => ({}));
  const admin = adminClient(); const ctx = await loadContext(admin);

  const queueId = body.queue_id ?? body.record?.id;
  if (queueId) { if (auth !== `Bearer ${serviceKey}`) return json({ error: 'Forbidden' }, 403); return processQueue(admin, ctx, queueId); }

  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Not signed in' }, 401);
  const me = { id: user.id, email: user.email };

  // A signed-in user may trigger only the "password changed" notice for themselves (throttled)
  if (body.self_notice === 'password_changed') {
    const since = new Date(Date.now() - 5 * 60000).toISOString();
    const { data: recent } = await admin.from('email_log').select('id').eq('template_key', 'password_changed').eq('to_email', me.email).gte('at', since).limit(1);
    if (recent?.length) return json({ skipped: 'recently sent' });
    const { data: tpl } = await admin.from('email_templates').select('*').eq('event_key', 'password_changed').eq('enabled', true).maybeSingle();
    if (!tpl || !ctx.enabled) return json({ skipped: 'disabled' });
    const { data: p } = await admin.from('profiles').select('full_name').eq('id', me.id).maybeSingle();
    const out = renderEmail(tpl, commonVars(ctx, me.email, p?.full_name), ctx.theme);
    try { await sendOne(ctx.theme, { to: me.email, subject: out.subject, html: out.html, text: out.text });
      await logEmails(admin, [{ template_key: 'password_changed', to_email: me.email, to_name: p?.full_name, subject: out.subject, status: 'sent', kind: 'auto' }]); return json({ sent: 1 }); }
    catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
  }

  if (body.manual) {
    const { data: ok } = await caller.rpc('has_permission', { perm: 'emails.manage' });
    if (!ok) return json({ error: 'Forbidden' }, 403);
    try { return await manual(admin, ctx, body.manual, me); } catch (e) { return json({ error: String((e as Error).message ?? e) }, 400); }
  }
  return json({ error: 'Nothing to do' }, 400);
});
