// Sends the "Password reset" email using YOUR template (Admin → Emails → Password reset) and your Email design,
// so it works even if the Supabase "Send Email" auth hook is not set up. Supabase's own reset email is never sent.
// Deploy:  supabase functions deploy password-reset --no-verify-jwt
// Needs:   RESEND_API_KEY secret, sender address in Admin → Email design, and the website address in Admin → Website (site_url).
import { adminClient, commonVars, loadContext, logEmails, renderEmail, sendOne } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let email = '';
  try { email = String((await req.json())?.email ?? '').trim().toLowerCase(); } catch { /* ignore */ }
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

  const admin = adminClient(); const ctx = await loadContext(admin);
  // The link always points at YOUR site (never at an address supplied by the caller), so it cannot be abused to leak tokens.
  const site = (ctx.appUrl || Deno.env.get('SITE_URL') || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/.test(site)) return json({ error: 'Set the public website address in Admin → Website first. It is used in the reset link.' }, 500);

  // Light throttle: one reset email per address per minute.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await admin.from('email_log').select('id').eq('template_key', 'password_reset').eq('to_email', email).gte('at', since).limit(1);
  if (recent?.length) return json({ ok: true });

  const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  // Unknown address: answer exactly like success so nobody can probe which emails have accounts.
  if (lerr || !link?.properties?.hashed_token) return json({ ok: true });

  const { data: tpl } = await admin.from('email_templates').select('*').eq('event_key', 'password_reset').maybeSingle();
  if (!tpl) return json({ error: 'The “Password reset” email template is missing. Run migration 008_emails.sql.' }, 500);

  const name = link.user?.user_metadata?.full_name as string | undefined;
  const actionUrl = `${site}/reset-password?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery`;
  const out = renderEmail(tpl, { ...commonVars(ctx, email, name), action_url: actionUrl }, ctx.theme);
  try {
    await sendOne(ctx.theme, { to: email, subject: out.subject, html: out.html, text: out.text });
    await logEmails(admin, [{ template_key: 'password_reset', to_email: email, to_name: name ?? null, subject: out.subject, status: 'sent', kind: 'auth' }]);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    await logEmails(admin, [{ template_key: 'password_reset', to_email: email, to_name: name ?? null, subject: out.subject, status: 'failed', error: msg, kind: 'auth' }]);
    return json({ error: msg }, 500);
  }
  return json({ ok: true });
});
