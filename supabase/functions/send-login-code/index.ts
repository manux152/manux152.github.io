// Deploy: supabase functions deploy send-login-code
// Emails a 6-digit sign-in code to the signed-in person (used when they sign in from a device we don't recognise).
// Uses the same sender, theme and RESEND_API_KEY as the other emails (Admin → Email design).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient, commonVars, loadContext, logEmails, renderEmail, sendOne, type Tpl } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');

const TPL: Tpl = {
  subject: '{team}: your sign-in code is {code}',
  body: 'Hi {first_name},\n\nSomeone is signing in to your {team} account from a device we don\'t recognise. Enter this code to continue:\n\n**{code}**\n\nThe code works for 10 minutes. If this wasn\'t you, don\'t share the code and change your password.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Not signed in' }, 401);

  const admin = adminClient();
  const { data: flag } = await admin.from('site_settings').select('value').eq('key', 'new_device_otp_enabled').maybeSingle();
  if (flag && flag.value === false) return json({ skipped: true });

  const { data: prev } = await admin.from('login_codes').select('created_at').eq('user_id', user.id).maybeSingle();
  if (prev && Date.now() - new Date(prev.created_at).getTime() < 30_000) return json({ error: 'Please wait 30 seconds before asking for another code.' }, 429);

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const { error: ce } = await admin.from('login_codes').upsert({ user_id: user.id, code_hash: await sha256(code + user.id), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), attempts: 0, created_at: new Date().toISOString() });
  if (ce) return json({ error: ce.message }, 500);

  try {
    const ctx = await loadContext(admin);
    if (!ctx.enabled) throw new Error('Emails are switched off in Admin → Email design');
    const { data: p } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const m = renderEmail(TPL, { ...commonVars(ctx, user.email, p?.full_name), code }, ctx.theme);
    await sendOne(ctx.theme, { to: user.email, subject: m.subject, html: m.html, text: m.text });
    await logEmails(admin, [{ template_key: 'login_code', to_email: user.email, to_name: p?.full_name ?? null, subject: 'Sign-in code', status: 'sent', kind: 'auth' }]);
    return json({ sent: true });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    await admin.from('login_codes').delete().eq('user_id', user.id);
    await logEmails(admin, [{ template_key: 'login_code', to_email: user.email, subject: 'Sign-in code', status: 'failed', error: msg, kind: 'auth' }]);
    return json({ error: msg }, 500);
  }
});
