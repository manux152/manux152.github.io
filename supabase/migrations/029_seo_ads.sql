-- Phase 30: search visibility (SEO) and an ad system, both managed from the Admin panel.
-- Safe to run more than once.

-- ═════════ SEO ═════════
insert into site_settings(key, value) values
  ('seo_description', '""'), ('seo_og_image', '""'), ('seo_twitter', '""'),
  ('seo_google_verify', '""'), ('seo_bing_verify', '""'), ('seo_city', '""'), ('seo_country', '""')
on conflict (key) do nothing;

-- Optional per-page overrides (e.g. path '/shop' or '/news'): what Google shows for that page.
create table if not exists seo_pages (
  id uuid primary key default gen_random_uuid(),
  path text not null unique check (path like '/%' and length(path) <= 200),
  title text check (title is null or length(title) <= 120),
  description text check (description is null or length(description) <= 300),
  image_url text,
  noindex boolean not null default false,
  created_at timestamptz not null default now()
);
alter table seo_pages enable row level security;
drop policy if exists "public read" on seo_pages;
drop policy if exists "manage" on seo_pages;
create policy "public read" on seo_pages for select using (true);
create policy "manage" on seo_pages for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

-- ═════════ Ads ═════════
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) <= 120),            -- internal name
  headline text check (headline is null or length(headline) <= 120),
  body text check (body is null or length(body) <= 300),
  image_url text,
  link_url text,
  cta_label text check (cta_label is null or length(cta_label) <= 40),
  advertiser text check (advertiser is null or length(advertiser) <= 120),
  show_home boolean not null default true,
  show_news boolean not null default false,
  show_match boolean not null default false,
  show_shop boolean not null default false,
  show_footer boolean not null default false,
  weight int not null default 1 check (weight between 1 and 10),   -- higher = shown more often
  starts_at timestamptz,
  ends_at timestamptz,
  max_impressions int check (max_impressions is null or max_impressions > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table ads enable row level security;

create table if not exists ad_stats (
  ad_id uuid not null references ads(id) on delete cascade,
  day date not null default current_date,
  placement text not null check (placement in ('home', 'news', 'match', 'shop', 'footer')),
  views int not null default 0,
  clicks int not null default 0,
  primary key (ad_id, day, placement)
);
alter table ad_stats enable row level security;
drop policy if exists "staff" on ad_stats;
create policy "staff" on ad_stats for select using (has_permission('settings.manage'));

-- Stats are private, so the "impression limit" check lives in a definer function the public policy can call.
create or replace function ad_has_budget(p_ad uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select a.max_impressions is null
                          or coalesce((select sum(s.views) from ad_stats s where s.ad_id = a.id), 0) < a.max_impressions
                   from ads a where a.id = p_ad), false)
$$;
grant execute on function ad_has_budget(uuid) to anon, authenticated;

drop policy if exists "live ads" on ads;
drop policy if exists "manage" on ads;
create policy "live ads" on ads for select using (
  is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) and ad_has_budget(id)
);
create policy "manage" on ads for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

create or replace function ad_track(p_ad uuid, p_placement text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_placement not in ('home', 'news', 'match', 'shop', 'footer') or p_kind not in ('view', 'click') then return; end if;
  if not exists (select 1 from ads where id = p_ad and is_active) then return; end if;
  insert into ad_stats(ad_id, day, placement, views, clicks)
  values (p_ad, current_date, p_placement, (p_kind = 'view')::int, (p_kind = 'click')::int)
  on conflict (ad_id, day, placement) do update
    set views = ad_stats.views + (p_kind = 'view')::int, clicks = ad_stats.clicks + (p_kind = 'click')::int;
end $$;
grant execute on function ad_track(uuid, text, text) to anon, authenticated;

insert into site_settings(key, value) values ('ads_enabled', 'true') on conflict (key) do nothing;
