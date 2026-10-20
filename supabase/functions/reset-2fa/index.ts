// Deploy: supabase functions deploy reset-2fa
// Lets an admin (permission 'users.manage') remove someone's 2FA when they lost their phone. They can then sign in with just their password and set 2FA up again.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: 'Not signed in' }, 401);
  const { data: allowed } = await caller.rpc('has_permission', { perm: 'users.manage' });
  if (!allowed) return json({ error: 'Forbidden' }, 403);

  const { user_id } = await req.json().catch(() => ({}));
  if (!user_id || typeof user_id !== 'string') return json({ error: 'Choose an account.' }, 400);
  if (user_id === user.id) return json({ error: 'Turn off your own 2FA from your Account page.' }, 400);
  const { data: canManage, error: le } = await caller.rpc('can_manage_user', { target: user_id });
  if (!le && canManage === false) return json({ error: 'You can only reset accounts below your own level.' }, 403);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: list, error } = await admin.auth.admin.mfa.listFactors({ userId: user_id });
  if (error) return json({ error: error.message }, 400);
  let removed = 0;
  for (const f of list?.factors ?? []) {
    const { error: de } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user_id });
    if (de) return json({ error: de.message }, 400);
    removed++;
  }
  return json({ ok: true, removed });
});
