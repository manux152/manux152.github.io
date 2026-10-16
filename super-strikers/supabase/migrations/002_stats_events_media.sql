-- Super Strikers — Phase 2: match events, player stats, media gallery

-- ───────── Event types (editable from admin) ─────────
create table event_types (
  id uuid primary key default gen_random_uuid(),
  label text unique not null,
  stat_key text check (stat_key in ('goal','goal_against','yellow_card','red_card')),  -- how it counts in stats
  sort_order int not null default 0
);

create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  event_type_id uuid not null references event_types(id),
  player_id uuid references players(id) on delete set null,          -- scorer / carded player
  related_player_id uuid references players(id) on delete set null,  -- assist provider
  minute int,
  notes text,
  created_at timestamptz not null default now()
);
create index on match_events(match_id);

create table match_players (
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  started boolean not null default true,
  minutes_played int,
  primary key (match_id, player_id)
);

-- Keep match score in sync with events (only once a match has events)
create or replace function sync_match_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare mid uuid := coalesce(new.match_id, old.match_id);
begin
  if exists (select 1 from match_events where match_id = mid) then
    update matches set
      goals_for = (select count(*) from match_events e join event_types t on t.id = e.event_type_id
                   where e.match_id = mid and t.stat_key = 'goal'),
      goals_against = (select count(*) from match_events e join event_types t on t.id = e.event_type_id
                   where e.match_id = mid and t.stat_key = 'goal_against')
    where id = mid;
  end if;
  return null;
end $$;
create trigger match_events_sync after insert or update or delete on match_events
  for each row execute function sync_match_score();

-- Player statistics, always computed from events and lineups
create or replace view player_stats with (security_invoker = true) as
select p.id as player_id, p.full_name, p.shirt_number, p.photo_url, p.position_id,
  (select count(*) from match_players mp join matches m on m.id = mp.match_id
     where mp.player_id = p.id and m.status = 'finished') as appearances,
  (select count(*) from match_events e join event_types t on t.id = e.event_type_id
     where e.player_id = p.id and t.stat_key = 'goal') as goals,
  (select count(*) from match_events e join event_types t on t.id = e.event_type_id
     where e.related_player_id = p.id and t.stat_key = 'goal') as assists,
  (select count(*) from match_events e join event_types t on t.id = e.event_type_id
     where e.player_id = p.id and t.stat_key = 'yellow_card') as yellow_cards,
  (select count(*) from match_events e join event_types t on t.id = e.event_type_id
     where e.player_id = p.id and t.stat_key = 'red_card') as red_cards
from players p where p.is_active;

-- ───────── Media ─────────
create table albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create table media_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references albums(id) on delete cascade,
  kind text not null default 'image' check (kind in ('image','video')),
  url text not null,                -- image URL, or video link (YouTube etc.)
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on media_items(album_id);

insert into storage.buckets (id, name, public) values ('media','media',true) on conflict do nothing;

-- ───────── Seeds ─────────
insert into event_types(label, stat_key, sort_order) values
  ('Goal','goal',1),('Opponent goal','goal_against',2),
  ('Yellow card','yellow_card',3),('Red card','red_card',4),('Substitution',null,5);

insert into permissions(key, description) values ('media.manage','Manage albums and media uploads');
insert into role_permissions select r.id,'media.manage' from roles r where r.name in ('Admin','Manager');

insert into nav_items(label, route, sort_order) values ('Statistics','/stats',6),('Media','/media',7);

-- ───────── RLS ─────────
alter table event_types enable row level security;
alter table match_events enable row level security;
alter table match_players enable row level security;
alter table albums enable row level security;
alter table media_items enable row level security;

create policy "public read" on event_types for select using (true);
create policy "public read" on match_events for select using (true);
create policy "public read" on match_players for select using (true);
create policy "public read" on albums for select using (is_published or has_permission('media.manage'));
create policy "public read" on media_items for select using (true);

create policy "manage" on event_types for all using (has_permission('matches.manage'));
create policy "manage" on match_events for all using (has_permission('matches.manage'));
create policy "manage" on match_players for all using (has_permission('matches.manage'));
create policy "manage" on albums for all using (has_permission('media.manage'));
create policy "manage" on media_items for all using (has_permission('media.manage'));

create policy "media public read" on storage.objects for select using (bucket_id = 'media');
create policy "media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and has_permission('media.manage'));
create policy "media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and has_permission('media.manage'));
