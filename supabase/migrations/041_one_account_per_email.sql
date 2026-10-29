-- One account per email address.
-- "Same address" means: upper/lower case ignored, anything after "+" ignored (name+club@x.com = name@x.com),
-- and for Gmail the dots are ignored too (n.a.me@gmail.com = name@gmail.com, googlemail.com = gmail.com).
-- Safe to run more than once. Accounts that already exist are never deleted or changed.

create or replace function public.normalize_email(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare e text := lower(btrim(coalesce(p, ''))); l text; d text;
begin
  if position('@' in e) = 0 then return e; end if;
  l := split_part(e, '@', 1); d := split_part(e, '@', 2);
  if split_part(l, '+', 1) <> '' then l := split_part(l, '+', 1); end if;
  if d in ('gmail.com', 'googlemail.com') then l := replace(l, '.', ''); d := 'gmail.com'; end if;
  return l || '@' || d;
end $$;

-- One row per account; the primary key is what makes a second account with the same address impossible.
create table if not exists public.account_emails (
  normalized_email text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.account_emails enable row level security;   -- no policies: nobody can read or write it from the app
revoke all on public.account_emails from anon, authenticated;

create or replace function public.sync_account_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or btrim(new.email) = '' then return new; end if;
  insert into public.account_emails (normalized_email, user_id)
  values (public.normalize_email(new.email), new.id)
  on conflict (user_id) do update set normalized_email = excluded.normalized_email;
  return new;
exception when unique_violation then
  raise exception 'One account per email: an account already exists for this email address.' using errcode = '23505';
end $$;

drop trigger if exists one_account_per_email on auth.users;
create trigger one_account_per_email after insert or update of email on auth.users
  for each row execute function public.sync_account_email();

-- Used by the sign-up function to show a friendly message.
create or replace function public.email_in_use(p_email text) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.account_emails where normalized_email = public.normalize_email(p_email));
$$;
revoke all on function public.email_in_use(text) from public, anon, authenticated;
grant execute on function public.email_in_use(text) to service_role;

-- Existing accounts: the oldest one keeps each address.
insert into public.account_emails (normalized_email, user_id)
select public.normalize_email(email), id from auth.users
where email is not null and btrim(email) <> ''
order by created_at
on conflict do nothing;

-- REPORT (the result you see after running this): people who already have more than one account.
-- No rows = nobody does. These accounts are left alone; the admin can decide what to do with them.
select public.normalize_email(email) as same_address, count(*) as accounts,
       string_agg(email || ' (' || created_at::date || ')', ', ' order by created_at) as the_accounts
from auth.users where email is not null
group by 1 having count(*) > 1;
