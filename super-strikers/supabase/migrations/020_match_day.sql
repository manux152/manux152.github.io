-- Super Strikers — Phase 20: match day (live match centre, goal alerts, Man of the Match voting, AI match reports)
-- Safe to run more than once.

-- ═════════ Settings (editable in Admin → Site settings) ═════════
insert into site_settings(key, value) values
  ('live_updates_enabled', 'true'),     -- show the live match centre to fans
  ('motm_enabled', 'true'),             -- fans can vote for Man of the Match
  ('motm_window_hours', '48')           -- how long voting stays open after full time
on conflict do nothing;

create or replace function md_flag(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when value = 'true'::jsonb or value #>> '{}' = 'true' then true
                               when value = 'false'::jsonb or value #>> '{}' = 'false' then false end
                   from site_settings where key = p_key), p_default);
$$;

create or replace function md_window_hours() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(value #>> '{}', '')::numeric from site_settings where key = 'motm_window_hours'), 48);
$$;

-- ═════════ Match clock ═════════
-- The clock is derived from these three columns, so fans' phones can tick on their own without any polling.
alter table matches add column if not exists period text not null default 'not_started'
  check (period in ('not_started', 'first_half', 'half_time', 'second_half', 'full_time'));
alter table matches add column if not exists period_started_at timestamptz;
alter table matches add column if not exists period_base_minute int not null default 0;   -- 0 for first half, 45 for second half
alter table matches add column if not exists motm_player_id uuid references players(id) on delete set null;

-- ═════════ Commentary ═════════
create table if not exists match_commentary (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  minute int,
  kind text not null default 'comment' check (kind in ('comment', 'kickoff', 'half_time', 'second_half', 'full_time', 'goal', 'card', 'sub', 'chance')),
  body text not null check (length(body) between 1 and 400),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists match_commentary_idx on match_commentary (match_id, created_at desc);

alter table match_commentary enable row level security;
drop policy if exists "read" on match_commentary;
drop policy if exists "manage" on match_commentary;
create policy "read" on match_commentary for select using (md_flag('live_updates_enabled', true) or has_permission('matches.manage'));
create policy "manage" on match_commentary for all using (has_permission('matches.manage')) with check (has_permission('matches.manage'));

-- ═════════ Match-day controls (one function so the clock and status always agree) ═════════
create or replace function match_set_period(p_match uuid, p_period text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; label text; k text;
begin
  if not has_permission('matches.manage') then raise exception 'Not allowed'; end if;
  if p_period not in ('first_half', 'half_time', 'second_half', 'full_time') then raise exception 'Unknown period'; end if;
  select * into m from matches where id = p_match;
  if not found then raise exception 'Match not found'; end if;

  if p_period = 'first_half' then
    update matches set status = 'live', period = 'first_half', period_started_at = now(), period_base_minute = 0 where id = p_match;
    label := 'Kick-off!'; k := 'kickoff';
  elsif p_period = 'half_time' then
    update matches set status = 'live', period = 'half_time', period_started_at = now() where id = p_match;
    label := 'Half time'; k := 'half_time';
  elsif p_period = 'second_half' then
    update matches set status = 'live', period = 'second_half', period_started_at = now(), period_base_minute = 45 where id = p_match;
    label := 'Second half under way'; k := 'second_half';
  else
    update matches set status = 'finished', period = 'full_time', period_started_at = now() where id = p_match;
    label := 'Full time'; k := 'full_time';
  end if;
  insert into match_commentary(match_id, minute, kind, body, created_by) values (p_match, null, k, label, auth.uid());
end $$;
revoke all on function match_set_period(uuid, text) from public;
grant execute on function match_set_period(uuid, text) to authenticated;

-- ═════════ Goal alerts ═════════
-- A goal event (for or against) during a live match writes a commentary line and queues a push.
create or replace function queue_goal_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare t event_types; m matches; opp text; who text; rule notification_rules; team text; vars jsonb; line text;
begin
  select * into t from event_types where id = new.event_type_id;
  if t.stat_key not in ('goal', 'goal_against', 'red_card') then return null; end if;
  select * into m from matches where id = new.match_id;
  if m.status <> 'live' then return null; end if;      -- only during the match; later corrections stay quiet
  select name into opp from opponents where id = m.opponent_id;
  select full_name into who from players where id = new.player_id;
  select value #>> '{}' into team from site_settings where key = 'team_name';

  line := case t.stat_key
    when 'goal' then 'GOAL! ' || coalesce(who, 'We') || ' scores' || case when new.minute is not null then ' (' || new.minute || '′)' else '' end
    when 'goal_against' then 'Goal for ' || coalesce(opp, 'the opposition') || case when new.minute is not null then ' (' || new.minute || '′)' else '' end
    else 'Red card' || case when who is not null then ' — ' || who else '' end end;
  insert into match_commentary(match_id, minute, kind, body)
  values (new.match_id, new.minute, case when t.stat_key = 'red_card' then 'card' else 'goal' end, line);

  if t.stat_key = 'red_card' then return null; end if;
  select * into rule from notification_rules where event_key = 'match_goal' and enabled;
  if not found then return null; end if;
  -- score is updated by sync_match_score (an earlier-named trigger fires first); re-read to be safe
  select * into m from matches where id = new.match_id;
  vars := jsonb_build_object('team', coalesce(team, ''), 'opponent', coalesce(opp, ''), 'scorer', coalesce(who, ''),
            'minute', coalesce(new.minute::text, ''), 'goals_for', coalesce(m.goals_for, 0), 'goals_against', coalesce(m.goals_against, 0));
  insert into notification_queue(title, body, data)
  values (render_template(rule.title_template, vars), render_template(rule.body_template, vars), jsonb_build_object('route', '/match/' || new.match_id));
  return null;
end $$;
drop trigger if exists zz_match_goal_push on match_events;
create trigger zz_match_goal_push after insert on match_events for each row execute function queue_goal_push();   -- "zz" so it runs after the score sync

insert into notification_rules(event_key, label, title_template, body_template) values
  ('match_goal', 'Goal scored (live)', '⚽ {team} {goals_for}–{goals_against} {opponent}', '{scorer} {minute}′ — tap for live updates')
on conflict (event_key) do nothing;

-- ═════════ Man of the Match voting ═════════
-- An older version of this table used user_id instead of voter_id; rename it so re-running this file works either way.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'motm_votes' and column_name = 'user_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'motm_votes' and column_name = 'voter_id') then
    alter table motm_votes rename column user_id to voter_id;
  end if;
end $$;
create table if not exists motm_votes (
  match_id uuid not null references matches(id) on delete cascade,
  voter_id uuid not null references profiles(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id)                 -- one vote per person per match; changing your mind replaces it
);
alter table motm_votes add column if not exists created_at timestamptz not null default now();
create unique index if not exists motm_votes_match_voter_uq on motm_votes (match_id, voter_id);   -- needed by the app's upsert
create index if not exists motm_votes_player_idx on motm_votes (match_id, player_id);

create or replace function motm_open(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select md_flag('motm_enabled', true) and exists (
    select 1 from matches m where m.id = p_match and m.status = 'finished' and m.motm_player_id is null
      and now() < coalesce(m.period_started_at, m.kickoff_at) + make_interval(hours => md_window_hours()::int));
$$;

alter table motm_votes enable row level security;
drop policy if exists "own read" on motm_votes;
drop policy if exists "own write" on motm_votes;
drop policy if exists "own change" on motm_votes;
create policy "own read" on motm_votes for select to authenticated using (voter_id = auth.uid() or has_permission('matches.manage'));
create policy "own write" on motm_votes for insert to authenticated with check (
  voter_id = auth.uid() and motm_open(match_id)
  and (not exists (select 1 from match_players mp where mp.match_id = motm_votes.match_id)
       or exists (select 1 from match_players mp where mp.match_id = motm_votes.match_id and mp.player_id = motm_votes.player_id)));
create policy "own change" on motm_votes for update to authenticated using (voter_id = auth.uid()) with check (
  voter_id = auth.uid() and motm_open(match_id)
  and (not exists (select 1 from match_players mp where mp.match_id = motm_votes.match_id)
       or exists (select 1 from match_players mp where mp.match_id = motm_votes.match_id and mp.player_id = motm_votes.player_id)));

-- Totals are visible to everyone who has voted, and to everyone once voting is closed. Nobody sees who voted for whom.
create or replace function motm_tally(p_match uuid) returns table (player_id uuid, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.player_id, count(*) from motm_votes v
  where v.match_id = p_match
    and (not motm_open(p_match) or exists (select 1 from motm_votes me where me.match_id = p_match and me.voter_id = auth.uid()) or has_permission('matches.manage'))
  group by v.player_id order by count(*) desc;
$$;
grant execute on function motm_tally(uuid) to anon, authenticated;

-- Staff close the vote (early, or after the window) and the winner is stored on the match.
-- A tie is refused so staff pick the winner themselves: motm_finalize(match, player).
create or replace function motm_finalize(p_match uuid, p_player uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare win uuid; top int; n int;
begin
  if not has_permission('matches.manage') then raise exception 'Not allowed'; end if;
  if p_player is not null then
    update matches set motm_player_id = p_player where id = p_match; return p_player;
  end if;
  select max(c) into top from (select count(*) c from motm_votes where match_id = p_match group by player_id) x;
  if top is null then raise exception 'No votes yet'; end if;
  select count(*) into n from (select player_id from motm_votes where match_id = p_match group by player_id having count(*) = top) y;
  if n > 1 then raise exception 'There is a tie — choose the winner yourself'; end if;
  select player_id into win from motm_votes where match_id = p_match group by player_id having count(*) = top;
  update matches set motm_player_id = win where id = p_match;
  return win;
end $$;
revoke all on function motm_finalize(uuid, uuid) from public;
grant execute on function motm_finalize(uuid, uuid) to authenticated;

-- Reopen voting (clears the stored winner)
create or replace function motm_reopen(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('matches.manage') then raise exception 'Not allowed'; end if;
  update matches set motm_player_id = null, period_started_at = now() where id = p_match;
end $$;
revoke all on function motm_reopen(uuid) from public;
grant execute on function motm_reopen(uuid) to authenticated;

-- ═════════ Live updates over the internet ═════════
do $$ begin
  begin alter publication supabase_realtime add table matches; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table match_events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table match_commentary; exception when duplicate_object then null; end;
end $$;
