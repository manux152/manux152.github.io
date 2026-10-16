-- Super Strikers — Phase 1 MVP schema (single team, nothing hardcoded)
-- Run in Supabase SQL editor or via `supabase db push`.

create extension if not exists "pgcrypto";

-- ───────── Roles & permissions (fully dynamic) ─────────
create table permissions (
  key text primary key,            -- e.g. 'players.manage'
  description text not null
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  is_system boolean not null default false,  -- built-ins can't be deleted
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid references roles(id) on delete cascade,
  permission_key text references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- ───────── Profiles & user roles ─────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid references profiles(id) on delete cascade,
  role_id uuid references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- Permission check used by RLS and the client
create or replace function has_permission(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = auth.uid() and rp.permission_key = perm
  );
$$;

-- ───────── Squad ─────────
create table positions (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0
);

create table players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  full_name text not null,
  shirt_number int,
  position_id uuid references positions(id),
  photo_url text,
  date_of_birth date,
  bio text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  full_name text not null,
  title text not null,              -- 'Head Coach', 'Manager', custom...
  photo_url text,
  bio text,
  sort_order int not null default 0
);

-- ───────── Matches & table ─────────
create table opponents (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  logo_url text
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  opponent_id uuid not null references opponents(id),
  kickoff_at timestamptz not null,
  venue text,
  is_home boolean not null default true,
  competition text,
  status text not null default 'scheduled'
    check (status in ('scheduled','live','finished','postponed','cancelled')),
  goals_for int,
  goals_against int,
  report text,
  created_at timestamptz not null default now()
);

-- Table computed live from results; points rules come from settings
create or replace view standings as
select
  count(*) filter (where status='finished') as played,
  count(*) filter (where status='finished' and goals_for > goals_against) as won,
  count(*) filter (where status='finished' and goals_for = goals_against) as drawn,
  count(*) filter (where status='finished' and goals_for < goals_against) as lost,
  coalesce(sum(goals_for) filter (where status='finished'),0) as goals_for,
  coalesce(sum(goals_against) filter (where status='finished'),0) as goals_against
from matches;

-- ───────── News & announcements ─────────
create table news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  summary text,
  body text not null,
  cover_url text,
  category text,
  is_featured boolean not null default false,
  published_at timestamptz,         -- null = draft
  author_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────── Site settings & navigation (all UI is data-driven) ─────────
create table site_settings (
  key text primary key,             -- 'team_name','logo_url','primary_color',...
  value jsonb not null
);

create table nav_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  route text not null,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  required_permission text references permissions(key)
);

-- ───────── Seed data ─────────
insert into permissions(key, description) values
  ('admin.access','Open the admin panel'),
  ('users.manage','Create and edit user accounts'),
  ('roles.manage','Create roles and edit permissions'),
  ('players.manage','Manage players'),
  ('staff.manage','Manage coaches, managers and staff'),
  ('matches.manage','Manage fixtures and results'),
  ('news.manage','Publish news and announcements'),
  ('settings.manage','Edit site settings and navigation');

insert into roles(name, description, is_system) values
  ('Admin','Full access',true),
  ('Manager','Runs the team',true),
  ('Coach','Squad and matches',true),
  ('Player','Standard member',true);

insert into role_permissions
  select r.id, p.key from roles r cross join permissions p where r.name='Admin';
insert into role_permissions
  select r.id, p.key from roles r join permissions p on p.key in
    ('admin.access','players.manage','staff.manage','matches.manage','news.manage')
  where r.name='Manager';
insert into role_permissions
  select r.id, p.key from roles r join permissions p on p.key in
    ('admin.access','players.manage','matches.manage')
  where r.name='Coach';

insert into positions(name, sort_order) values
  ('Goalkeeper',1),('Defender',2),('Midfielder',3),('Forward',4);

insert into site_settings(key, value) values
  ('team_name','"Super Strikers"'),
  ('primary_color','"#0B6E4F"'),
  ('logo_url','null'),
  ('points_win','3'),('points_draw','1'),('points_loss','0');

insert into nav_items(label, route, sort_order) values
  ('Home','/',1),('Matches','/matches',2),('Table','/table',3),
  ('News','/news',4),('Players','/players',5);

-- ───────── Row Level Security ─────────
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table positions enable row level security;
alter table players enable row level security;
alter table staff enable row level security;
alter table opponents enable row level security;
alter table matches enable row level security;
alter table news_posts enable row level security;
alter table announcements enable row level security;
alter table site_settings enable row level security;
alter table nav_items enable row level security;

-- Public read of public content
create policy "public read" on positions for select using (true);
create policy "public read" on players for select using (is_active);
create policy "public read" on staff for select using (true);
create policy "public read" on opponents for select using (true);
create policy "public read" on matches for select using (true);
create policy "public read" on announcements for select using (is_active);
create policy "public read" on site_settings for select using (true);
create policy "public read" on nav_items for select using (is_visible);
create policy "public read published" on news_posts for select
  using (published_at is not null and published_at <= now() or has_permission('news.manage'));

-- Signed-in read of access control data (needed to resolve own permissions)
create policy "read" on permissions for select to authenticated using (true);
create policy "read" on roles for select to authenticated using (true);
create policy "read" on role_permissions for select to authenticated using (true);
create policy "own roles" on user_roles for select to authenticated
  using (user_id = auth.uid() or has_permission('users.manage'));
create policy "own profile" on profiles for select to authenticated
  using (id = auth.uid() or has_permission('users.manage'));
create policy "update own profile" on profiles for update to authenticated
  using (id = auth.uid());

-- Admin writes, gated by permission
create policy "manage" on profiles for all using (has_permission('users.manage'));
create policy "manage" on user_roles for all using (has_permission('users.manage'));
create policy "manage" on roles for all using (has_permission('roles.manage'));
create policy "manage" on role_permissions for all using (has_permission('roles.manage'));
create policy "manage" on players for all using (has_permission('players.manage'));
create policy "manage" on positions for all using (has_permission('players.manage'));
create policy "manage" on staff for all using (has_permission('staff.manage'));
create policy "manage" on opponents for all using (has_permission('matches.manage'));
create policy "manage" on matches for all using (has_permission('matches.manage'));
create policy "manage" on news_posts for all using (has_permission('news.manage'));
create policy "manage" on announcements for all using (has_permission('news.manage'));
create policy "manage" on site_settings for all using (has_permission('settings.manage'));
create policy "manage" on nav_items for all using (has_permission('settings.manage'));

-- Auto-create a profile when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- After creating your first account, make yourself Admin:
-- insert into user_roles(user_id, role_id)
--   select '<YOUR_USER_UUID>', id from roles where name='Admin';
