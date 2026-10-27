-- 036: Login security
--  1) Admin-controlled auto sign-out after inactivity (site setting idle_logout_minutes; 0 = off)
--  2) One-time emailed code when someone signs in from a device we don't recognise (site setting new_device_otp_enabled)
-- Run once in the Supabase SQL Editor. Safe to run again.

insert into site_settings(key, value) values
  ('idle_logout_minutes', '10'::jsonb),
  ('new_device_otp_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- Pending one-time codes (only the hash is stored). No policies on purpose: only the functions below and the edge function can touch it.
create table if not exists login_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter table login_codes enable row level security;

-- Devices a person has already verified (only a hash of the device token is stored).
create table if not exists trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, token_hash)
);
alter table trusted_devices enable row level security;
drop policy if exists "own devices read" on trusted_devices;
create policy "own devices read" on trusted_devices for select using (user_id = auth.uid());
drop policy if exists "own devices delete" on trusted_devices;
create policy "own devices delete" on trusted_devices for delete using (user_id = auth.uid());

create or replace function ss_hash(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

create or replace function new_device_otp_on() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from site_settings where key = 'new_device_otp_enabled'), true)
$$;

-- Is the calling person's current device one they've verified before? (true for everyone when the feature is switched off)
create or replace function device_trusted(p_token text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if not new_device_otp_on() then return true; end if;
  if p_token is null or length(p_token) < 20 then return false; end if;
  update trusted_devices set last_used_at = now() where user_id = auth.uid() and token_hash = ss_hash(p_token);
  return found;
end $$;

-- Checks the emailed code. Returns 'ok:<new device token>', or 'wrong' / 'expired' / 'locked'.
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
  return 'ok:' || tok;
end $$;

-- Admin button: everyone has to verify their device again at their next sign-in.
create or replace function forget_all_trusted_devices() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_permission('settings.manage') then raise exception 'Forbidden'; end if;
  delete from trusted_devices where true; get diagnostics n = row_count;
  return n;
end $$;

revoke all on function device_trusted(text), verify_login_code(text, text), forget_all_trusted_devices() from public, anon;
grant execute on function device_trusted(text), verify_login_code(text, text), forget_all_trusted_devices() to authenticated;
