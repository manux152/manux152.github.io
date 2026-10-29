-- 042: About us page (introduction, mission, vision, value proposition) and Leadership. Edited in Admin → About us.
-- Run once in the Supabase SQL Editor. Safe to run again: nothing already saved is overwritten.

create table if not exists about_sections (
  key text primary key check (key in ('intro', 'mission', 'vision', 'value_proposition')),
  title text not null default '',
  body text not null default '',
  is_visible boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists about_leaders (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role_title text not null default '',
  bio text not null default '',
  photo_url text,
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table about_sections enable row level security;
alter table about_leaders enable row level security;
drop policy if exists "public read" on about_sections;
drop policy if exists "manage" on about_sections;
drop policy if exists "public read" on about_leaders;
drop policy if exists "manage" on about_leaders;
-- Visitors see only what is switched on; people with the settings permission see and change everything.
create policy "public read" on about_sections for select using (is_visible);
create policy "manage" on about_sections for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy "public read" on about_leaders for select using (is_visible);
create policy "manage" on about_leaders for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

-- Starting headings. The texts stay empty (and hidden from visitors) until you write them in Admin → About us.
insert into about_sections (key, title, body, sort_order) values
  ('intro', 'About us', '', 1),
  ('mission', 'Our mission', '', 2),
  ('vision', 'Our vision', '', 3),
  ('value_proposition', 'Our value proposition', '', 4)
on conflict (key) do nothing;

-- Leadership photos are saved in the existing "branding" storage bucket (folder "leadership"), which only people with the settings permission can write to.
