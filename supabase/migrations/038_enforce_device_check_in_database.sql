-- 038: Make the "new device" email-code check binding in the DATABASE, not just in the login screen.
--
-- How it works
--  * A password sign-in only becomes usable once its session is recorded in verified_sessions. That happens in two places only:
--    device_trusted() (this browser holds a device token from an earlier emailed code) and verify_login_code() (the right code was entered).
--  * A RESTRICTIVE row-level-security policy "device_gate" is added to every table in the public schema (and to file storage).
--    Restrictive policies are ANDed with the existing policies, so nothing else about your access rules changes.
--  * has_permission() also returns false for an unverified session, which covers every admin power and the functions that rely on it.
--  * Only sessions that signed in with a password alone are held back. Sessions from email links (confirm email, reset password),
--    passkeys and authenticator-app (2FA) sign-ins carry another sign-in method in their token and are let through.
--  * Sessions that exist right now are marked verified, so nobody is signed out when this runs.
--
-- EMERGENCY OFF SWITCH (if emails ever stop working and nobody can sign in), run this in the SQL Editor:
--     update site_settings set value = 'false'::jsonb where key = 'new_device_otp_enabled';
--
-- Run 036 and 037 first, deploy send-login-code, and test the new-device code once BEFORE running this.

create table if not exists verified_sessions (
  session_id uuid primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table verified_sessions enable row level security;   -- no policies: only the functions below touch it

-- Is the current request's session allowed to use data?
create or replace function session_ok() returns boolean language plpgsql stable security definer set search_path = public as $$
declare claims jsonb := auth.jwt(); sid uuid; methods text[];
begin
  if claims is null or coalesce(claims ->> 'role', '') <> 'authenticated' then return true; end if;   -- anonymous visitors and server-side calls
  if not new_device_otp_on() then return true; end if;
  begin sid := nullif(claims ->> 'session_id', '')::uuid; exception when others then return true; end;
  if sid is null then return true; end if;
  begin
    select array_agg(m ->> 'method') into methods from jsonb_array_elements(coalesce(claims -> 'amr', '[]'::jsonb)) m;
  exception when others then return true; end;
  if methods is null or exists (select 1 from unnest(methods) x where x is distinct from 'password') then return true; end if;   -- not a password-only sign-in
  return exists (select 1 from verified_sessions where session_id = sid);
end $$;
revoke all on function session_ok() from public;
grant execute on function session_ok() to anon, authenticated, service_role;

-- Internal helper: record the caller's current session as verified.
create or replace function mark_session_verified() returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  begin sid := nullif(auth.jwt() ->> 'session_id', '')::uuid; exception when others then return; end;
  if sid is null or auth.uid() is null then return; end if;
  insert into verified_sessions(session_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  begin   -- tidy up rows for sessions that no longer exist
    delete from verified_sessions v where v.user_id = auth.uid() and not exists (select 1 from auth.sessions s where s.id = v.session_id);
  exception when others then null; end;
end $$;
revoke all on function mark_session_verified() from public, anon, authenticated;

create or replace function device_trusted(p_token text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if not new_device_otp_on() then return true; end if;
  if p_token is null or length(p_token) < 20 then return false; end if;
  update trusted_devices set last_used_at = now() where user_id = auth.uid() and token_hash = ss_hash(p_token);
  if not found then return false; end if;
  perform mark_session_verified();
  return true;
end $$;

create or replace function verify_login_code(p_code text, p_label text default null) returns text language plpgsql security definer set search_path = public as $$
declare r login_codes; tok text;
begin
  if auth.uid() is null then return 'expired'; end if;
  select * into r from login_codes where user_id = auth.uid() for update;
  if not found or r.expires_at < now() then return 'expired'; end if;
  if r.attempts >= 5 then return 'locked'; end if;
  if r.code_hash <> ss_hash(trim(coalesce(p_code, '')) || auth.uid()::text) then
    update login_codes set attempts = attempts + 1 where user_id = auth.uid();
    return 'wrong';
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into trusted_devices(user_id, token_hash, label) values (auth.uid(), ss_hash(tok), left(coalesce(p_label, ''), 120));
  delete from trusted_devices where user_id = auth.uid() and id not in (select id from trusted_devices where user_id = auth.uid() order by last_used_at desc limit 20);
  delete from login_codes where user_id = auth.uid();
  perform mark_session_verified();
  return 'ok:' || tok;
end $$;

-- Every admin power goes through has_permission(), so an unverified session has none.
create or replace function has_permission(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select session_ok() and exists (
    select 1 from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    join profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and rp.permission_key = perm and p.is_active
  );
$$;

-- Switch the gate on. Existing sessions are marked verified first; if that fails nothing is locked.
do $$
declare t record; grandfathered boolean := false; n int := 0;
begin
  begin
    insert into verified_sessions(session_id, user_id) select id, user_id from auth.sessions on conflict do nothing;
    grandfathered := true;
  exception when others then
    raise notice 'Could not read auth.sessions (%). The database gate was NOT switched on, so nobody is locked out.', sqlerrm;
  end;
  if grandfathered then
    for t in select schemaname, tablename from pg_tables where schemaname = 'public' and rowsecurity loop
      execute format('drop policy if exists device_gate on %I.%I', t.schemaname, t.tablename);
      execute format('create policy device_gate on %I.%I as restrictive for all to authenticated using ((select public.session_ok())) with check ((select public.session_ok()))', t.schemaname, t.tablename);
      n := n + 1;
    end loop;
    raise notice 'Device gate added to % tables.', n;
    begin
      execute 'drop policy if exists device_gate on storage.objects';
      execute 'create policy device_gate on storage.objects as restrictive for all to authenticated using ((select public.session_ok())) with check ((select public.session_ok()))';
      raise notice 'Device gate added to file storage.';
    exception when others then
      raise notice 'Could not add the gate to file storage (%). Tables are still protected.', sqlerrm;
    end;
  end if;
end $$;

-- Tables in the public schema WITHOUT row-level security cannot be gated. This lists them (ideally none you care about).
select tablename as table_without_rls from pg_tables where schemaname = 'public' and not rowsecurity order by 1;
