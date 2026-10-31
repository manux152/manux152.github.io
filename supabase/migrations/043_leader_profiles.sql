-- 043: Leader profile pages and linking a leader to an existing site account. Run once in the Supabase SQL Editor (safe to run again).
-- Needs migration 042 (About us) and the chat migration to be in place already.

-- Which leader belongs to which site account. Only people with the settings permission can see or change these links;
-- visitors never see account ids (they only see a yes/no "can be messaged" flag on the leader).
create table if not exists about_leader_accounts (
  leader_id uuid primary key references about_leaders(id) on delete cascade,
  profile_id uuid not null unique references profiles(id) on delete cascade,   -- one account can be linked to one leader only
  created_at timestamptz not null default now()
);
alter table about_leader_accounts enable row level security;
drop policy if exists "manage" on about_leader_accounts;
create policy "manage" on about_leader_accounts for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

alter table about_leaders add column if not exists has_account boolean not null default false;

create or replace function about_sync_has_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then update about_leaders set has_account = false where id = old.leader_id; end if;
  if tg_op in ('INSERT', 'UPDATE') then update about_leaders set has_account = true where id = new.leader_id; end if;
  return null;
end $$;
drop trigger if exists about_leader_accounts_flag on about_leader_accounts;
create trigger about_leader_accounts_flag after insert or update or delete on about_leader_accounts
  for each row execute function about_sync_has_account();
update about_leaders l set has_account = exists (select 1 from about_leader_accounts a where a.leader_id = l.id);

-- Admin: find site accounts by name or email (people with the settings permission only).
create or replace function about_find_accounts(p_q text) returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, u.email::text
  from profiles p join auth.users u on u.id = p.id
  where has_permission('settings.manage') and p.is_active and length(trim(coalesce(p_q, ''))) >= 2
    and (p.full_name ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%' or u.email ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%')
  order by p.full_name limit 15;
$$;

-- Admin: the current links, with the account name and email.
create or replace function about_account_links() returns table (leader_id uuid, profile_id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select a.leader_id, a.profile_id, p.full_name, u.email::text
  from about_leader_accounts a join profiles p on p.id = a.profile_id join auth.users u on u.id = a.profile_id
  where has_permission('settings.manage');
$$;

-- Signed-in visitors: start (or reopen) a chat with the person linked to a leader. The club's usual chat rules still apply
-- (chat switched on, chat_can_dm), so nobody can be messaged who could not be messaged anyway.
create or replace function about_message_leader(p_leader uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to send a message'; end if;
  select a.profile_id into pid from about_leader_accounts a join about_leaders l on l.id = a.leader_id where a.leader_id = p_leader and l.is_visible;
  if pid is null then raise exception 'This leader cannot be messaged here'; end if;
  if pid = auth.uid() then raise exception 'This is your own profile'; end if;
  return chat_open_direct(pid);
end $$;

revoke all on function about_find_accounts(text), about_account_links(), about_message_leader(uuid) from public, anon;
grant execute on function about_find_accounts(text), about_account_links(), about_message_leader(uuid) to authenticated;
