-- 037: Fan club (email sign-ups, double opt-in, unsubscribe) and newsletters (write, test, send to fans and/or members).
-- Run once in the Supabase SQL Editor. Safe to run again.

insert into permissions(key, description) values ('newsletters.manage', 'Write and send newsletters, and manage fan club sign-ups')
on conflict do nothing;
insert into role_permissions(role_id, permission_key)
select id, 'newsletters.manage' from roles where lower(name) in ('admin', 'super admin', 'super_admin', 'superadmin', 'manager')
on conflict do nothing;

-- Supporters who join with just a name and email (no player account).
create table if not exists fans (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  interests text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  confirm_token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  unsub_token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  source text,
  created_at timestamptz not null default now(),
  confirm_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);
create unique index if not exists fans_email_key on fans (lower(email));
create unique index if not exists fans_confirm_token_key on fans (confirm_token);
create unique index if not exists fans_unsub_token_key on fans (unsub_token);
alter table fans enable row level security;
drop policy if exists "manage" on fans;
create policy "manage" on fans for all using (has_permission('newsletters.manage')) with check (has_permission('newsletters.manage'));
-- No public policies on purpose: sign-ups, confirmations and unsubscribes go through the fan-join function.

create table if not exists newsletters (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null default '',
  audience text not null default 'both' check (audience in ('fans', 'members', 'both')),
  topic text check (topic in ('news', 'matches', 'shop', 'events')),   -- null = all fans; otherwise only fans who picked that interest
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  last_error text
);
alter table newsletters enable row level security;
drop policy if exists "manage" on newsletters;
create policy "manage" on newsletters for all using (has_permission('newsletters.manage')) with check (has_permission('newsletters.manage'));

-- Audience sizes shown in the newsletter composer.
create or replace function newsletter_audience_counts(p_topic text default null) returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('newsletters.manage') then raise exception 'Forbidden'; end if;
  return json_build_object(
    'fans', (select count(*) from fans where status = 'active' and (p_topic is null or p_topic = any(interests))),
    'members', (select count(*) from profiles where is_active and email is not null and not email_opt_out));
end $$;
revoke all on function newsletter_audience_counts(text) from public, anon;
grant execute on function newsletter_audience_counts(text) to authenticated;

-- "Fan club" in the website menu (under More). Hide or rename it in Admin → Menu.
insert into nav_items(label, route, sort_order)
select 'Fan club', '/fans', coalesce((select max(sort_order) from nav_items), 0) + 1
where not exists (select 1 from nav_items where route = '/fans');
