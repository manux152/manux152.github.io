-- Super Strikers — Phase 39: deleted or deactivated accounts lose ALL access immediately.
-- Layers: (1) deactivating bans the login and ends every session, (2) every API request from a deactivated or deleted account is refused,
-- (3) file uploads/changes are refused, (4) reactivating lifts the ban. Run this once in the Supabase SQL editor.

create or replace function account_is_active(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where id = uid), false);
$$;

-- (1) Deactivate → ban the login, end all sessions, stop notifications. Activate → lift the ban.
create or replace function revoke_access_on_deactivate() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.is_active is false and old.is_active is distinct from false then
    update auth.users set banned_until = 'infinity' where id = new.id;
    delete from auth.sessions where user_id = new.id;       -- refresh tokens go with their sessions
    delete from push_tokens where user_id = new.id;
  elsif new.is_active is true and old.is_active is distinct from true then
    update auth.users set banned_until = null where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists profiles_revoke_access on profiles;
create trigger profiles_revoke_access after update of is_active on profiles for each row execute function revoke_access_on_deactivate();

-- Accounts that are already deactivated get the same treatment now
update auth.users set banned_until = 'infinity' where id in (select id from profiles where is_active is false);
delete from auth.sessions where user_id in (select id from profiles where is_active is false);

-- (2) Gate every API request. A token that is still valid (signed tokens last up to an hour) stops working the moment the profile is
-- deactivated or deleted. Visitors and the server's own key are not signed in as a person, so they pass straight through.
create or replace function block_inactive_accounts() returns void
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is not null and not account_is_active(uid) then
    raise exception 'account_inactive' using errcode = 'PT403', hint = 'This account has been deactivated or deleted.';
  end if;
end $$;
grant execute on function block_inactive_accounts() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.block_inactive_accounts';
notify pgrst, 'reload config';

-- (3) File storage does not pass through the API gate above, so it gets its own rule
do $$ begin
  drop policy if exists "inactive accounts blocked" on storage.objects;
  create policy "inactive accounts blocked" on storage.objects as restrictive for all to authenticated
    using (account_is_active(auth.uid())) with check (account_is_active(auth.uid()));
exception when others then
  raise notice 'Could not add the storage rule (%). Add it in the dashboard if you want uploads blocked too.', sqlerrm;
end $$;
