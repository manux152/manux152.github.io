-- Super Strikers — Phase 24: video clip tagging, anonymous analytics, export log, language preference
-- Safe to run more than once.
--
-- PRIVACY: analytics store page paths and counts only — no IP address, no user id, no device details.
-- A "visitor" is a random code made when the app opens; it is not linked to a person.

-- ═════════ Permission ═════════
insert into permissions(key, description) values ('video.manage', 'Add match videos and tag clips and highlights')
on conflict do nothing;
insert into role_permissions(role_id, permission_key)
select id, 'video.manage' from roles where lower(name) in ('admin', 'manager', 'coach')
on conflict do nothing;

insert into site_settings(key, value) values
  ('analytics_enabled', 'true'),
  ('default_language', '"en"')
on conflict do nothing;

-- ═════════ Language preference (synced across a member's devices) ═════════
alter table profiles add column if not exists language text check (language is null or language in ('en', 'fr', 'es', 'pt', 'sw'));

-- ═════════ Match videos and clips ═════════
create table if not exists match_videos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  title text not null check (length(title) between 2 and 120),
  url text not null check (url ~* '^https?://' and length(url) <= 500),
  is_published boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table match_videos add column if not exists id uuid default gen_random_uuid();
alter table match_videos add column if not exists match_id uuid references matches(id) on delete cascade;
alter table match_videos add column if not exists title text check (length(title) between 2 and 120);
alter table match_videos add column if not exists url text check (url ~* '^https?://' and length(url) <= 500);
alter table match_videos add column if not exists is_published boolean not null default true;
alter table match_videos add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table match_videos add column if not exists created_at timestamptz not null default now();
create index if not exists match_videos_match_idx on match_videos (match_id, created_at);

create table if not exists video_clips (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references match_videos(id) on delete cascade,
  start_sec int not null check (start_sec between 0 and 21600),
  end_sec int check (end_sec is null or (end_sec > start_sec and end_sec <= 21600)),
  tag text not null default 'other' check (tag in ('goal', 'chance', 'save', 'tackle', 'assist', 'skill', 'card', 'mistake', 'other')),
  player_id uuid references players(id) on delete set null,
  note text check (note is null or length(note) <= 200),
  is_public boolean not null default true,          -- false = coaching clip, staff only (e.g. a mistake to review)
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table video_clips add column if not exists id uuid default gen_random_uuid();
alter table video_clips add column if not exists video_id uuid references match_videos(id) on delete cascade;
alter table video_clips add column if not exists start_sec int check (start_sec between 0 and 21600);
alter table video_clips add column if not exists end_sec int check (end_sec is null or (end_sec > start_sec and end_sec <= 21600));
alter table video_clips add column if not exists tag text not null default 'other' check (tag in ('goal', 'chance', 'save', 'tackle', 'assist', 'skill', 'card', 'mistake', 'other'));
alter table video_clips add column if not exists player_id uuid references players(id) on delete set null;
alter table video_clips add column if not exists note text check (note is null or length(note) <= 200);
alter table video_clips add column if not exists is_public boolean not null default true;
alter table video_clips add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table video_clips add column if not exists created_at timestamptz not null default now();
create index if not exists video_clips_video_idx on video_clips (video_id, start_sec);
create index if not exists video_clips_player_idx on video_clips (player_id) where is_public;

alter table match_videos enable row level security;
alter table video_clips enable row level security;
drop policy if exists "read" on match_videos; drop policy if exists "manage" on match_videos;
drop policy if exists "read" on video_clips; drop policy if exists "manage" on video_clips;
create policy "read" on match_videos for select using (is_published or has_permission('video.manage'));
create policy "manage" on match_videos for all to authenticated using (has_permission('video.manage')) with check (has_permission('video.manage'));
create policy "read" on video_clips for select using (
  has_permission('video.manage') or (is_public and exists (select 1 from match_videos v where v.id = video_id and v.is_published)));
create policy "manage" on video_clips for all to authenticated using (has_permission('video.manage')) with check (has_permission('video.manage'));

-- ═════════ Anonymous analytics ═════════
create table if not exists analytics_daily (
  day date not null,
  path text not null check (length(path) <= 80),
  views int not null default 0,
  primary key (day, path)
);
-- Older version of this table already there? Add any columns it is missing.
alter table analytics_daily add column if not exists day date;
alter table analytics_daily add column if not exists path text check (length(path) <= 80);
alter table analytics_daily add column if not exists views int not null default 0;
create table if not exists analytics_visitors (
  day date not null,
  visitor text not null check (length(visitor) between 8 and 40),
  primary key (day, visitor)
);
-- Older version of this table already there? Add any columns it is missing.
alter table analytics_visitors add column if not exists day date;
alter table analytics_visitors add column if not exists visitor text check (length(visitor) between 8 and 40);
alter table analytics_daily enable row level security;
alter table analytics_visitors enable row level security;
-- no policies on purpose: only the functions below can read or write these tables

create or replace function analytics_hit(p_path text, p_visitor text) returns void
language plpgsql security definer set search_path = public as $$
declare pth text := left(coalesce(p_path, ''), 80);
begin
  if not fan_flag('analytics_enabled', true) then return; end if;
  if pth !~ '^/[A-Za-z0-9_/:\-\.\(\)\[\]]*$' then return; end if;                -- plain paths only, never query strings
  if p_visitor is null or length(p_visitor) not between 8 and 40 or p_visitor !~ '^[A-Za-z0-9]+$' then return; end if;
  insert into analytics_daily(day, path, views) values (current_date, pth, 1)
    on conflict (day, path) do update set views = analytics_daily.views + 1;
  insert into analytics_visitors(day, visitor) values (current_date, p_visitor) on conflict do nothing;
  if random() < 0.01 then                                                          -- tidy up now and then: keep 400 days
    delete from analytics_daily where day < current_date - 400;
    delete from analytics_visitors where day < current_date - 400;
  end if;
end $$;
grant execute on function analytics_hit(text, text) to anon, authenticated;

create or replace function analytics_report(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(1, least(coalesce(p_days, 30), 365)); since date;
begin
  if not (has_permission('reports.view') or has_permission('settings.manage')) then raise exception 'Not allowed'; end if;
  since := current_date - (d - 1);
  return jsonb_build_object(
    'days', d,
    'views', coalesce((select sum(views) from analytics_daily where day >= since), 0),
    'visitors', coalesce((select count(*) from analytics_visitors where day >= since), 0),       -- visits: one per visitor per day
    'signups', (select count(*) from profiles where created_at::date >= since),
    'orders', (select count(*) from orders where payment_status = 'paid' and coalesce(paid_at, created_at)::date >= since),
    'revenue', coalesce((select sum(subtotal + delivery_fee) from orders where payment_status = 'paid' and coalesce(paid_at, created_at)::date >= since), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', g.day::date, 'views', coalesce(v.views, 0), 'visitors', coalesce(u.n, 0), 'signups', coalesce(s.n, 0)) order by g.day)
      from generate_series(since, current_date, interval '1 day') as g(day)
      left join (select day, sum(views) views from analytics_daily where day >= since group by day) v on v.day = g.day::date
      left join (select day, count(*) n from analytics_visitors where day >= since group by day) u on u.day = g.day::date
      left join (select created_at::date as day, count(*) n from profiles where created_at::date >= since group by 1) s on s.day = g.day::date), '[]'::jsonb),
    'top_pages', coalesce((
      select jsonb_agg(jsonb_build_object('path', path, 'views', views) order by views desc)
      from (select path, sum(views) views from analytics_daily where day >= since group by path order by sum(views) desc limit 15) t), '[]'::jsonb));
end $$;
revoke all on function analytics_report(int) from public, anon;
grant execute on function analytics_report(int) to authenticated;

-- ═════════ Export log ═════════
-- Exports contain personal data, so each one is written to the audit log (who, what, how many rows — never the data itself).
create or replace function log_export(p_dataset text, p_rows int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  insert into audit_log(actor, table_name, op, row_pk, new_data)
  values (auth.uid(), 'export', 'export', left(coalesce(p_dataset, ''), 60), jsonb_build_object('rows', greatest(0, coalesce(p_rows, 0))));
end $$;
revoke all on function log_export(text, int) from public, anon;
grant execute on function log_export(text, int) to authenticated;
