// Creates player accounts and sends the "Confirm email" message from YOUR template (Admin → Emails → Confirm email),
// so sign-up works without Supabase's limited built-in email sender. Also re-sends the confirmation link.
// Deploy:  supabase functions deploy signup --no-verify-jwt
// Needs:   RESEND_API_KEY secret, sender address in Admin → Email design, public address in Admin → Website (site_url).
import { adminClient, commonVars, loadContext, logEmails, renderEmail, sendOne } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let b: any = {};
  try { b = await req.json(); } catch { /* ignore */ }
  const email = clean(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

  const admin = adminClient(); const ctx = await loadContext(admin);
  // The link always points at YOUR site, never at an address supplied by the caller.
  const site = (ctx.appUrl || Deno.env.get('SITE_URL') || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/.test(site)) return json({ error: 'Set the public website address in Admin → Website first. It is used in the confirmation link.' }, 500);

  const { data: tpl } = await admin.from('email_templates').select('*').eq('event_key', 'email_confirm').maybeSingle();
  if (!tpl) return json({ error: 'The “Confirm email” template is missing. Run migration 008_emails.sql.' }, 500);

  const send = async (token: string, type: 'signup' | 'magiclink', name?: string) => {
    const actionUrl = `${site}/confirm-email?token_hash=${encodeURIComponent(token)}&type=${type}`;
    const out = renderEmail(tpl, { ...commonVars(ctx, email, name), action_url: actionUrl }, ctx.theme);
    try {
      await sendOne(ctx.theme, { to: email, subject: out.subject, html: out.html, text: out.text });
      await logEmails(admin, [{ template_key: 'email_confirm', to_email: email, to_name: name ?? null, subject: out.subject, status: 'sent', kind: 'auth' }]);
      return null;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      await logEmails(admin, [{ template_key: 'email_confirm', to_email: email, to_name: name ?? null, subject: out.subject, status: 'failed', error: msg, kind: 'auth' }]);
      return msg;
    }
  };

  // ── Re-send the confirmation link (for someone who signed up but never got / lost the email)
  if (b.action === 'resend') {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin.from('email_log').select('id').eq('template_key', 'email_confirm').eq('to_email', email).gte('at', since).limit(1);
    if (recent?.length) return json({ ok: true });
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !link?.properties?.hashed_token) return json({ ok: true });   // unknown address: same answer as success
    const fail = await send(link.properties.hashed_token, 'magiclink', link.user?.user_metadata?.full_name);
    return fail ? json({ error: fail }, 500) : json({ ok: true });
  }

  // ── New account
  const password = String(b.password ?? '');
  if (password.length < 8) return json({ error: 'Choose a password of at least 8 characters.' }, 400);
  const full_name = clean(b.full_name, 120), team_code = clean(b.team_code, 40), referral_code = clean(b.referral_code, 20);

  const { data: check } = await admin.rpc('check_signup', { p_email: email, p_code: team_code });
  if (check === 'code') return json({ error: 'That team code is not valid, has already been used, has expired, or is for a different email.' }, 400);
  if (check === 'domain') return json({ error: 'Please use your team email address.' }, 400);

  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'signup', email, password, options: { data: { team_code, full_name, referral_code } } });
  if (error || !link?.properties?.hashed_token) {
    const m = String(error?.message ?? '');
    if (/already|registered|exists/i.test(m)) return json({ error: 'There is already an account for that email. Sign in, or use “Forgot password?”.' }, 400);
    return json({ error: m || 'Could not create the account.' }, 400);
  }
  const fail = await send(link.properties.hashed_token, 'signup', full_name);
  if (fail) return json({ error: `Your account was created, but the confirmation email could not be sent (${fail}). Tell the club admin.` }, 500);
  return json({ ok: true });
});
