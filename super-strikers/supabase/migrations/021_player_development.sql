-- Super Strikers — Phase 21: player development (match ratings, coach notes, injury & return-to-play tracker, badges, form guide)
-- Safe to run more than once.
--
-- PRIVACY: ratings, notes and injuries are about named people (often young people). They are NOT public.
--   • staff with "development.manage" can read and write them
--   • a player can read only their own injury record, and only the ratings/notes a coach chose to "share with the player"
--   • nothing here is visible to the public or to other players
-- Injury records are deliberately NOT copied into the audit log.

-- ═════════ Permission (Admin, Manager and Coach roles) ═════════
insert into permissions(key, description) values
  ('development.manage', 'Rate players, write development notes and track injuries and return to play')
on conflict do nothing;
insert into role_permissions(role_id, permission_key)
select id, 'development.manage' from roles where name in ('Admin', 'Manager', 'Coach')
on conflict do nothing;

-- ═════════ Ratings and coach notes ═════════
create table if not exists player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,           -- null = a general note, not tied to a match
  rating numeric(3, 1) check (rating is null or (rating >= 1 and rating <= 10)),
  note text check (note is null or length(note) <= 1000),
  shared boolean not null default false,                            -- true = the player can read this entry
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rating is not null or note is not null),
  unique (match_id, player_id, created_by)                          -- one rating per coach per player per match
);
-- If an older version of this table already exists, bring it up to date (no-ops when the columns are there).
alter table player_ratings add column if not exists match_id uuid references matches(id) on delete cascade;
alter table player_ratings add column if not exists rating numeric(3, 1);
alter table player_ratings add column if not exists note text;
alter table player_ratings add column if not exists shared boolean not null default false;
alter table player_ratings add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table player_ratings add column if not exists created_at timestamptz not null default now();
alter table player_ratings add column if not exists updated_at timestamptz not null default now();
create index if not exists player_ratings_player_idx on player_ratings (player_id, created_at desc);
create index if not exists player_ratings_match_idx on player_ratings (match_id);

create or replace function touch_player_rating() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch on player_ratings;
create trigger touch before update on player_ratings for each row execute function touch_player_rating();

alter table player_ratings enable row level security;
drop policy if exists "manage" on player_ratings;
drop policy if exists "own shared read" on player_ratings;
create policy "manage" on player_ratings for all using (has_permission('development.manage')) with check (has_permission('development.manage'));
create policy "own shared read" on player_ratings for select to authenticated using (
  shared and exists (select 1 from players p where p.id = player_id and p.profile_id = auth.uid()));

-- ═════════ Injury and return-to-play tracker ═════════
create table if not exists player_injuries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  description text not null check (length(description) between 1 and 300),   -- e.g. "Sprained ankle"
  status text not null default 'out' check (status in ('out', 'limited', 'cleared')),
  started_on date not null default current_date,
  expected_return date,
  cleared_on date,
  plan text check (plan is null or length(plan) <= 1000),                    -- return-to-play steps, written by staff
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- If an older version of this table already exists, bring it up to date (no-ops when the columns are there).
alter table player_injuries add column if not exists description text;
alter table player_injuries add column if not exists status text not null default 'out';
alter table player_injuries add column if not exists started_on date not null default current_date;
alter table player_injuries add column if not exists expected_return date;
alter table player_injuries add column if not exists cleared_on date;
alter table player_injuries add column if not exists plan text;
alter table player_injuries add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table player_injuries add column if not exists created_at timestamptz not null default now();
alter table player_injuries add column if not exists updated_at timestamptz not null default now();
create index if not exists player_injuries_player_idx on player_injuries (player_id, started_on desc);
create index if not exists player_injuries_open_idx on player_injuries (status) where status <> 'cleared';

create or replace function touch_player_injury() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'cleared' and new.cleared_on is null then new.cleared_on := current_date; end if;
  if new.status <> 'cleared' then new.cleared_on := null; end if;
  return new;
end $$;
drop trigger if exists touch on player_injuries;
create trigger touch before insert or update on player_injuries for each row execute function touch_player_injury();

alter table player_injuries enable row level security;
drop policy if exists "manage" on player_injuries;
drop policy if exists "own read" on player_injuries;
create policy "manage" on player_injuries for all using (has_permission('development.manage')) with check (has_permission('development.manage'));
create policy "own read" on player_injuries for select to authenticated using (
  exists (select 1 from players p where p.id = player_id and p.profile_id = auth.uid()));

-- ═════════ Form guide (public: it only uses results and events that are already public) ═════════
create or replace function player_form(p_player uuid, p_limit int default 10)
returns table (match_id uuid, kickoff_at timestamptz, opponent text, is_home boolean, goals_for int, goals_against int,
               started boolean, goals bigint, assists bigint, yellow bigint, red bigint, motm boolean)
language sql stable security invoker set search_path = public as $$
  select m.id, m.kickoff_at, o.name, m.is_home, m.goals_for, m.goals_against, mp.started,
    (select count(*) from match_events e join event_types t on t.id = e.event_type_id where e.match_id = m.id and e.player_id = p_player and t.stat_key = 'goal'),
    (select count(*) from match_events e join event_types t on t.id = e.event_type_id where e.match_id = m.id and e.related_player_id = p_player and t.stat_key = 'goal'),
    (select count(*) from match_events e join event_types t on t.id = e.event_type_id where e.match_id = m.id and e.player_id = p_player and t.stat_key = 'yellow_card'),
    (select count(*) from match_events e join event_types t on t.id = e.event_type_id where e.match_id = m.id and e.player_id = p_player and t.stat_key = 'red_card'),
    (m.motm_player_id = p_player)
  from match_players mp
  join matches m on m.id = mp.match_id and m.status = 'finished'
  join opponents o on o.id = m.opponent_id
  where mp.player_id = p_player
  order by m.kickoff_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
grant execute on function player_form(uuid, int) to anon, authenticated;

-- ═════════ Badges ═════════
-- Worked out from results, never typed in by hand. Public badges use public data only.
-- Training badges use attendance, which is private, so they are returned only to staff and to the player themselves.
create or replace function player_badges(p_player uuid)
returns table (key text, label text, icon text, detail text, tier int, is_private boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  apps int; goals int; assists int; motms int; hats int; sessions int; mine boolean; staff boolean;
begin
  select count(*) into apps from match_players mp join matches m on m.id = mp.match_id and m.status = 'finished' where mp.player_id = p_player;
  select count(*) into goals from match_events e join event_types t on t.id = e.event_type_id where e.player_id = p_player and t.stat_key = 'goal';
  select count(*) into assists from match_events e join event_types t on t.id = e.event_type_id where e.related_player_id = p_player and t.stat_key = 'goal';
  select count(*) into motms from matches where motm_player_id = p_player;
  select count(*) into hats from (
    select e.match_id from match_events e join event_types t on t.id = e.event_type_id
    where e.player_id = p_player and t.stat_key = 'goal' group by e.match_id having count(*) >= 3) h;

  if goals >= 1 then return query select 'first_goal', 'First goal', '⚽', 'Scored a goal for the club', 1, false; end if;
  if goals >= 25 then return query select 'goals', '25 goals', '🔥', goals || ' goals for the club', 3, false;
  elsif goals >= 10 then return query select 'goals', '10 goals', '🔥', goals || ' goals for the club', 2, false;
  elsif goals >= 5 then return query select 'goals', '5 goals', '🔥', goals || ' goals for the club', 1, false; end if;
  if hats >= 1 then return query select 'hat_trick', 'Hat-trick', '🎩', case when hats = 1 then 'Three goals in one match' else hats || ' hat-tricks' end, 1, false; end if;
  if assists >= 10 then return query select 'assists', '10 assists', '🎯', assists || ' assists', 2, false;
  elsif assists >= 5 then return query select 'assists', '5 assists', '🎯', assists || ' assists', 1, false; end if;
  if apps >= 50 then return query select 'apps', '50 appearances', '👕', apps || ' appearances', 3, false;
  elsif apps >= 25 then return query select 'apps', '25 appearances', '👕', apps || ' appearances', 2, false;
  elsif apps >= 10 then return query select 'apps', '10 appearances', '👕', apps || ' appearances', 1, false; end if;
  if motms >= 1 then return query select 'motm', 'Man of the Match', '⭐', case when motms = 1 then 'Voted Man of the Match' else 'Voted Man of the Match ' || motms || ' times' end, least(motms, 3), false; end if;

  select exists (select 1 from players p where p.id = p_player and p.profile_id = auth.uid()) into mine;
  staff := has_permission('development.manage');
  if mine or staff then
    select count(*) into sessions from training_attendance where player_id = p_player and status in ('present', 'late');
    if sessions >= 25 then return query select 'training', '25 training sessions', '🏋️', sessions || ' sessions attended', 2, true;
    elsif sessions >= 10 then return query select 'training', '10 training sessions', '🏋️', sessions || ' sessions attended', 1, true; end if;
  end if;
end $$;
grant execute on function player_badges(uuid) to anon, authenticated;
