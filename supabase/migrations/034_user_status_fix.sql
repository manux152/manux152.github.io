-- Super Strikers — Phase 41: fix "Database error loading user" and add a Deleted accounts list.
-- Cause: deactivating set auth.users.banned_until to 'infinity', which Supabase Auth cannot read back, so deleting
-- (or loading) a deactivated account failed. A far-future date works the same and is readable. Safe to re-run.

-- 1) Deactivating now uses a finite far-future ban date
create or replace function revoke_access_on_deactivate() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.is_active is false and old.is_active is distinct from false then
    update auth.users set banned_until = now() + interval '100 years' where id = new.id;
    delete from auth.sessions where user_id = new.id;
    delete from push_tokens where user_id = new.id;
  elsif new.is_active is true and old.is_active is distinct from true then
    update auth.users set banned_until = null where id = new.id;
  end if;
  return new;
end $$;

-- 2) Repair accounts that were already deactivated
update auth.users set banned_until = now() + interval '100 years' where banned_until = 'infinity';

-- 3) Deleted accounts list (admins with users.manage can read it)
create table if not exists deleted_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  full_name text,
  deleted_at timestamptz not null default now()
);
alter table deleted_accounts enable row level security;
drop policy if exists "read" on deleted_accounts;
create policy "read" on deleted_accounts for select using (has_permission('users.manage'));

create or replace function log_deleted_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin insert into deleted_accounts(user_id, email, full_name) values (old.id, old.email, old.full_name);
  exception when others then raise warning 'log_deleted_account: %', sqlerrm; end;
  return old;
end $$;
drop trigger if exists log_deleted_account on profiles;
create trigger log_deleted_account before delete on profiles for each row execute function log_deleted_account();

-- 4) Fill the list with accounts deleted before today (from the email queue, if their "deleted" email was queued)
insert into deleted_accounts(user_id, email, full_name, deleted_at)
select null, q.to_email, coalesce(q.to_name, ''), min(q.created_at)
from email_queue q where q.template_key = 'account_deleted'
group by q.to_email, q.to_name
having not exists (select 1 from deleted_accounts d where d.email = q.to_email);
