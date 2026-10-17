// Deploy: supabase functions deploy delete-user
// Lets an admin (permission 'users.manage') permanently delete someone else's account: login, profile, roles, push tokens and linked player profile.
// Their sessions stop working at once (see migration 032).
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
  if (!user_id || typeof user_id !== 'string') return json({ error: 'Choose an account to delete.' }, 400);
  if (user_id === user.id) return json({ error: 'Use “Delete my account” on your own Account page to remove yourself.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Never leave the team without anyone who can manage users
  const { data: rp } = await admin.from('role_permissions').select('role_id').eq('permission_key', 'users.manage');
  const roleIds = (rp ?? []).map((r: any) => r.role_id);
  const { data: holders } = roleIds.length ? await admin.from('user_roles').select('user_id').in('role_id', roleIds) : { data: [] };
  const ids = [...new Set((holders ?? []).map((h: any) => h.user_id))];
  if (ids.length === 1 && ids[0] === user_id) return json({ error: 'That person is the only user manager. Give someone else that permission first.' }, 400);

  await admin.from('players').delete().eq('profile_id', user_id);
  const { error } = await admin.auth.admin.deleteUser(user_id);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
