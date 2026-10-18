// Deploy: supabase functions deploy create-user
// Creates an account with a temporary password and assigns roles. Caller must hold 'users.manage'.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { passwordOk, PASSWORD_ERROR } from '../_shared/password.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: allowed } = await caller.rpc('has_permission', { perm: 'users.manage' });
  if (!allowed) return json({ error: 'Forbidden' }, 403);

  const { email, password, full_name, role_ids } = await req.json();
  if (!email || !password) return json({ error: 'Email and a password are required' }, 400);
  if (!passwordOk(String(password))) return json({ error: PASSWORD_ERROR }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Admin-created accounts pass through the sign-up rules with a short-lived, email-locked, role-less code
  const code = ('ADMIN-' + crypto.randomUUID()).toUpperCase();   // the sign-up rule compares codes in UPPER case
  const { error: ce } = await admin.from('team_codes').insert({ code, email: String(email).toLowerCase(), bypass_domain: true, assign_role: false,
    expires_at: new Date(Date.now() + 10 * 60000).toISOString(), note: 'Created by an admin' });
  if (ce) return json({ error: 'Could not prepare the account: ' + ce.message }, 400);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, team_code: code } });
  if (error) { await admin.from('team_codes').delete().eq('code', code); return json({ error: error.message }, 400); }
  if (role_ids?.length) {
    const { error: e2 } = await admin.from('user_roles').insert(role_ids.map((role_id: string) => ({ user_id: data.user.id, role_id })));
    if (e2) return json({ error: e2.message }, 400);
  }
  return json({ id: data.user.id });
});
