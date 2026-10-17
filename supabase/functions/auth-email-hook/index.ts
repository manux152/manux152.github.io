// Sends Supabase Auth emails (confirm sign-up, password reset, magic link, invite) using YOUR templates and design.
// Deploy WITHOUT JWT verification:  supabase functions deploy auth-email-hook --no-verify-jwt
// Then: Dashboard → Authentication → Hooks → "Send Email" → HTTPS → URL https://<project-ref>.supabase.co/functions/v1/auth-email-hook
// Generate the hook secret there and store it:  supabase secrets set SEND_EMAIL_HOOK_SECRET="v1,whsec_..."
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { adminClient, commonVars, loadContext, logEmails, renderEmail, sendOne } from '../_shared/email.ts';

const KEYS: Record<string, string> = { signup: 'email_confirm', recovery: 'password_reset', magiclink: 'magic_link', invite: 'invite' };
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const payload = await req.text();
  let user: any, ed: any;
  try {
    const secret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
    ({ user, email_data: ed } = new Webhook(secret).verify(payload, Object.fromEntries(req.headers)) as any);
  } catch { return fail(401, 'Invalid signature'); }

  const key = KEYS[ed.email_action_type];
  if (!key) return fail(400, `Email type "${ed.email_action_type}" is not supported by this app`);
  const admin = adminClient(); const ctx = await loadContext(admin);
  const { data: tpl } = await admin.from('email_templates').select('*').eq('event_key', key).maybeSingle();
  if (!tpl) return fail(500, `Email template "${key}" is missing`);

  const base = Deno.env.get('SUPABASE_URL')!;
  const site = (ctx.appUrl || '').replace(/\/+$/, '');
  const actionUrl = ed.email_action_type === 'recovery' && /^https:\/\//.test(site)
    ? `${site}/reset-password?token_hash=${encodeURIComponent(ed.token_hash)}&type=recovery`
    : `${base}/auth/v1/verify?token=${encodeURIComponent(ed.token_hash)}&type=${encodeURIComponent(ed.email_action_type)}&redirect_to=${encodeURIComponent(ed.redirect_to ?? ed.site_url ?? '')}`;
  const name = user.user_metadata?.full_name as string | undefined;
  const vars = { ...commonVars(ctx, user.email, name), action_url: actionUrl };
  const out = renderEmail(tpl, vars, ctx.theme);
  try {
    await sendOne(ctx.theme, { to: user.email, subject: out.subject, html: out.html, text: out.text });
    await logEmails(admin, [{ template_key: key, to_email: user.email, to_name: name ?? null, subject: out.subject, status: 'sent', kind: 'auth' }]);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    await logEmails(admin, [{ template_key: key, to_email: user.email, to_name: name ?? null, subject: out.subject, status: 'failed', error: msg, kind: 'auth' }]);
    return fail(500, msg);
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
