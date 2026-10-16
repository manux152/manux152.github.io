-- Super Strikers — Phase 5: match-day reminders + league tables (manual or from any league API)

-- ───────── Match-day reminders ─────────
alter table matches add column reminder_sent_at timestamptz;

create or replace function reset_reminder() returns trigger language plpgsql as $$
begin
  if new.kickoff_at is distinct from old.kickoff_at then new.reminder_sent_at := null; end if;
  return new;
end $$;
create trigger matches_reset_reminder before update of kickoff_at on matches
  for each row execute function reset_reminder();

create or replace function queue_match_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare rule notification_rules; hrs numeric; tz text; team text; m record; vars jsonb; n int := 0;
begin
  select * into rule from notification_rules where event_key = 'match_reminder' and enabled;
  if not found then return 0; end if;
  select (value #>> '{}')::numeric into hrs from site_settings where key = 'match_reminder_hours';
  select value #>> '{}' into tz from site_settings where key = 'timezone';
  select value #>> '{}' into team from site_settings where key = 'team_name';
  hrs := coalesce(hrs, 24); tz := coalesce(tz, 'UTC');
  for m in
    select ma.*, o.name as opp from matches ma join opponents o on o.id = ma.opponent_id
    where ma.status = 'scheduled' and ma.reminder_sent_at is null
      and ma.kickoff_at > now() and ma.kickoff_at <= now() + (hrs * interval '1 hour')
  loop
    vars := jsonb_build_object('team', coalesce(team,''), 'opponent', m.opp,
      'time', to_char(m.kickoff_at at time zone tz, 'Dy DD Mon HH24:MI'),
      'venue', coalesce(m.venue,''), 'home_away', case when m.is_home then 'Home' else 'Away' end);
    insert into notification_queue(title, body, data)
    values (render_template(rule.title_template, vars), render_template(rule.body_template, vars),
            jsonb_build_object('route', '/match/' || m.id));
    update matches set reminder_sent_at = now() where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function queue_match_reminders() from public, anon, authenticated;

create or replace function run_match_reminders() returns int
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('notifications.manage') then raise exception 'Forbidden'; end if;
  return queue_match_reminders();
end $$;

insert into notification_rules(event_key, label, title_template, body_template) values
  ('match_reminder','Match reminder','⚽ {team} vs {opponent}','{time} · {home_away}{venue}')
  on conflict do nothing;
insert into site_settings(key, value) values ('match_reminder_hours','24'), ('timezone','"UTC"') on conflict do nothing;

-- ───────── League tables ─────────
create table api_providers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  url_template text not null,     -- {league} and {season} are filled from the competition; {{LEAGUE_API_XXX}} = secret
  headers jsonb not null default '{}',
  rows_path text not null,        -- dot path to the standings array, e.g. standings.0.table
  field_map jsonb not null,       -- our column -> dot path inside each row
  notes text
);

create table competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text,
  source text not null default 'manual' check (source in ('manual','api')),
  provider_id uuid references api_providers(id) on delete set null,
  config jsonb not null default '{}',   -- {"league":"PL","own_team_name":"Super Strikers"}
  auto_sync boolean not null default true,
  is_visible boolean not null default true,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now()
);

create table standings_rows (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  position int,
  team_name text not null,
  team_logo text,
  played int not null default 0, won int not null default 0, drawn int not null default 0, lost int not null default 0,
  goals_for int not null default 0, goals_against int not null default 0, goal_diff int not null default 0,
  points int not null default 0,
  form text,
  is_own_team boolean not null default false
);
create index on standings_rows(competition_id, position);

-- Starter provider presets (verify against the provider's current docs; fields can be edited in Admin)
insert into api_providers(name, url_template, headers, rows_path, field_map, notes) values
 ('football-data.org',
  'https://api.football-data.org/v4/competitions/{league}/standings?season={season}',
  '{"X-Auth-Token":"{{LEAGUE_API_FOOTBALL_DATA}}"}', 'standings.0.table',
  '{"position":"position","team_name":"team.name","team_logo":"team.crest","played":"playedGames","won":"won","drawn":"draw","lost":"lost","goals_for":"goalsFor","goals_against":"goalsAgainst","goal_diff":"goalDifference","points":"points","form":"form"}',
  'League = competition code (e.g. PL). Set secret LEAGUE_API_FOOTBALL_DATA.'),
 ('API-Football',
  'https://v3.football.api-sports.io/standings?league={league}&season={season}',
  '{"x-apisports-key":"{{LEAGUE_API_APISPORTS}}"}', 'response.0.league.standings.0',
  '{"position":"rank","team_name":"team.name","team_logo":"team.logo","played":"all.played","won":"all.win","drawn":"all.draw","lost":"all.lose","goals_for":"all.goals.for","goals_against":"all.goals.against","goal_diff":"goalsDiff","points":"points","form":"form"}',
  'League = numeric league id, season = year. Set secret LEAGUE_API_APISPORTS.');

insert into permissions(key, description) values ('competitions.manage','Manage league tables and API providers');
insert into role_permissions select r.id,'competitions.manage' from roles r where r.name in ('Admin','Manager');

-- RLS
alter table api_providers enable row level security;
alter table competitions enable row level security;
alter table standings_rows enable row level security;
create policy "manage" on api_providers for all using (has_permission('competitions.manage'));
create policy "public read" on competitions for select using (is_visible or has_permission('competitions.manage'));
create policy "manage" on competitions for all using (has_permission('competitions.manage'));
create policy "public read" on standings_rows for select using (true);
create policy "manage" on standings_rows for all using (has_permission('competitions.manage'));
