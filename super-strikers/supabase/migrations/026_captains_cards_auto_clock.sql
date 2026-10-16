-- Super Strikers — Phase 26
--   1) Repairs match_commentary (fixes: column "kind" of relation "match_commentary" does not exist)
--   2) Captain + vice-captain (C / VC armbands) on the tactics board and on each match lineup
--   3) Yellow / red cards: event types guaranteed, commentary lines, second yellow = automatic red
--   4) Automatic match day: "starting soon" alert, auto kick-off, 45 + added / 15 min break / 45 + added, auto full time
-- Safe to run more than once.

-- ═════════ 1) Repair match_commentary ═════════
-- An older copy of this table was created before Phase 20, so "create table if not exists" skipped it and columns are missing.
create table if not exists match_commentary (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  minute int,
  kind text not null default 'comment',
  body text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table match_commentary add column if not exists minute int;
alter table match_commentary add column if not exists kind text not null default 'comment';
alter table match_commentary add column if not exists body text not null default '';
alter table match_commentary add column if not exists created_by uuid references profiles(id) on delete set null;
alter table match_commentary add column if not exists created_at timestamptz not null default now();
alter table match_commentary alter column body set default '';
alter table match_commentary drop constraint if exists match_commentary_kind_check;
alter table match_commentary add constraint match_commentary_kind_check
  check (kind in ('comment', 'kickoff', 'half_time', 'second_half', 'full_time', 'goal', 'card', 'sub', 'chance', 'added_time')) not valid;
create index if not exists match_commentary_idx on match_commentary (match_id, created_at desc);

alter table match_commentary enable row level security;
drop policy if exists "read" on match_commentary;
drop policy if exists "manage" on match_commentary;
create policy "read" on match_commentary for select using (md_flag('live_updates_enabled', true) or has_permission('matches.manage'));
create policy "manage" on match_commentary for all using (has_permission('matches.manage')) with check (has_permission('matches.manage'));

-- ═════════ 2) Captains ═════════
-- Tactics board: one captain + one vice-captain per team shape. Match lineup: its own pair for that match.
alter table formations add column if not exists captain_id uuid references players(id) on delete set null;
alter table formations add column if not exists vice_captain_id uuid references players(id) on delete set null;
alter table lineups add column if not exists captain_id uuid references players(id) on delete set null;
alter table lineups add column if not exists vice_captain_id uuid references players(id) on delete set null;
alter table formations drop constraint if exists formations_captains_differ;
alter table formations add constraint formations_captains_differ check (captain_id is null or captain_id <> vice_captain_id);
alter table lineups drop constraint if exists lineups_captains_differ;
alter table lineups add constraint lineups_captains_differ check (captain_id is null or captain_id <> vice_captain_id);

-- ═════════ 3) Cards ═════════
-- Make sure both card types exist (they are seeded in Phase 2, but may have been renamed or removed).
insert into event_types(label, stat_key, sort_order)
select 'Yellow card', 'yellow_card', 3 where not exists (select 1 from event_types where stat_key = 'yellow_card')
on conflict do nothing;
insert into event_types(label, stat_key, sort_order)
select 'Red card', 'red_card', 4 where not exists (select 1 from event_types where stat_key = 'red_card')
on conflict do nothing;

insert into site_settings(key, value) values ('auto_red_on_second_yellow', 'true') on conflict do nothing;

-- Live commentary for goals, cards and substitutions (replaces the Phase 20 version, which only handled goals and red cards
-- and wrongly wrote "Red card" for substitutions). Only goals send a push notification.
create or replace function queue_goal_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare t event_types; m matches; opp text; who text; rule notification_rules; team text; vars jsonb; line text; sk text; ck text; mn text;
begin
  select * into t from event_types where id = new.event_type_id;
  sk := coalesce(t.stat_key, case when t.label ilike 'sub%' then 'sub' else null end);
  if sk is null or sk not in ('goal', 'goal_against', 'yellow_card', 'red_card', 'sub') then return null; end if;
  select * into m from matches where id = new.match_id;
  if m.status <> 'live' then return null; end if;      -- only during the match; later corrections stay quiet
  select name into opp from opponents where id = m.opponent_id;
  select full_name into who from players where id = new.player_id;
  select value #>> '{}' into team from site_settings where key = 'team_name';

  mn := case when new.minute is not null then ' (' || new.minute || '′)' else '' end;
  line := case sk
    when 'goal' then 'GOAL! ' || coalesce(who, 'We') || ' scores' || mn
    when 'goal_against' then 'Goal for ' || coalesce(opp, 'the opposition') || mn
    when 'yellow_card' then 'Yellow card — ' || coalesce(who, opp, 'opposition') || mn
    when 'red_card' then 'Red card — ' || coalesce(who, opp, 'opposition') || mn
    else 'Substitution' || case when who is not null then ' — ' || who else '' end || mn end;
  ck := case when sk in ('goal', 'goal_against') then 'goal' when sk = 'sub' then 'sub' else 'card' end;
  insert into match_commentary(match_id, minute, kind, body) values (new.match_id, new.minute, ck, line);

  if sk not in ('goal', 'goal_against') then return null; end if;
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

-- A second yellow card to the same player in the same match adds a red card automatically (switch off with auto_red_on_second_yellow = false).
create or replace function auto_second_yellow() returns trigger
language plpgsql security definer set search_path = public as $$
declare t event_types; red uuid; n int;
begin
  if new.player_id is null then return null; end if;
  select * into t from event_types where id = new.event_type_id;
  if t.stat_key is distinct from 'yellow_card' then return null; end if;
  if not md_flag('auto_red_on_second_yellow', true) then return null; end if;
  select count(*) into n from match_events e join event_types x on x.id = e.event_type_id
   where e.match_id = new.match_id and e.player_id = new.player_id and x.stat_key = 'yellow_card';
  if n <> 2 then return null; end if;
  if exists (select 1 from match_events e join event_types x on x.id = e.event_type_id
              where e.match_id = new.match_id and e.player_id = new.player_id and x.stat_key = 'red_card') then return null; end if;
  select id into red from event_types where stat_key = 'red_card' order by sort_order limit 1;
  if red is null then return null; end if;
  insert into match_events(match_id, event_type_id, player_id, minute, notes) values (new.match_id, red, new.player_id, new.minute, 'Second yellow card');
  return null;
end $$;
drop trigger if exists zzz_second_yellow on match_events;
create trigger zzz_second_yellow after insert on match_events for each row execute function auto_second_yellow();   -- "zzz" so it runs after the commentary trigger

-- ═════════ 4) Automatic match day ═════════
alter table matches add column if not exists auto_clock boolean not null default true;                 -- per-match switch
alter table matches add column if not exists first_half_added int not null default 0 check (first_half_added between 0 and 30);
alter table matches add column if not exists second_half_added int not null default 0 check (second_half_added between 0 and 30);
alter table matches add column if not exists starting_soon_sent_at timestamptz;

insert into site_settings(key, value) values
  ('auto_match_clock', 'true'),        -- master switch for the automatic clock
  ('pre_match_minutes', '10'),         -- fans see the countdown, prediction, line-ups and venue this long before kick-off
  ('half_time_minutes', '15'),         -- length of the half-time break
  ('default_added_time', '2')          -- minutes of added time each half starts with; staff change it in the live console
on conflict do nothing;

insert into notification_rules(event_key, label, title_template, body_template) values
  ('match_starting_soon', 'Match starting soon', '⏱️ {team} vs {opponent} kicks off soon', 'Kick-off {time} · {venue} — line-ups and prediction inside')
on conflict (event_key) do nothing;

create or replace function md_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(value #>> '{}', '')::int from site_settings where key = p_key), p_default);
$$;

-- Moving the kick-off time re-arms the "starting soon" alert.
create or replace function reset_starting_soon() returns trigger language plpgsql as $$
begin
  if new.kickoff_at is distinct from old.kickoff_at then new.starting_soon_sent_at := null; end if;
  return new;
end $$;
drop trigger if exists matches_reset_starting_soon on matches;
create trigger matches_reset_starting_soon before update of kickoff_at on matches for each row execute function reset_starting_soon();

-- Staff controls (replaces the Phase 20 version: also starts each half with the default added time, and a finished match never keeps a null score).
create or replace function match_set_period(p_match uuid, p_period text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; label text; k text; added int;
begin
  if not has_permission('matches.manage') then raise exception 'Not allowed'; end if;
  if p_period not in ('first_half', 'half_time', 'second_half', 'full_time') then raise exception 'Unknown period'; end if;
  select * into m from matches where id = p_match;
  if not found then raise exception 'Match not found'; end if;
  added := md_int('default_added_time', 2);

  if p_period = 'first_half' then
    update matches set status = 'live', period = 'first_half', period_started_at = now(), period_base_minute = 0, first_half_added = added where id = p_match;
    label := 'Kick-off!'; k := 'kickoff';
  elsif p_period = 'half_time' then
    update matches set status = 'live', period = 'half_time', period_started_at = now() where id = p_match;
    label := 'Half time'; k := 'half_time';
  elsif p_period = 'second_half' then
    update matches set status = 'live', period = 'second_half', period_started_at = now(), period_base_minute = 45, second_half_added = added where id = p_match;
    label := 'Second half under way'; k := 'second_half';
  else
    update matches set status = 'finished', period = 'full_time', period_started_at = now(),
      goals_for = coalesce(goals_for, 0), goals_against = coalesce(goals_against, 0) where id = p_match;
    label := 'Full time'; k := 'full_time';
  end if;
  insert into match_commentary(match_id, minute, kind, body, created_by) values (p_match, null, k, label, auth.uid());
end $$;
revoke all on function match_set_period(uuid, text) from public;
grant execute on function match_set_period(uuid, text) to authenticated;

-- Set the announced added time (total minutes) for the half being played.
create or replace function match_set_added_time(p_match uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  if not has_permission('matches.manage') then raise exception 'Not allowed'; end if;
  if p_minutes < 0 or p_minutes > 30 then raise exception 'Added time must be between 0 and 30 minutes'; end if;
  select * into m from matches where id = p_match;
  if not found then raise exception 'Match not found'; end if;
  if m.period = 'first_half' then update matches set first_half_added = p_minutes where id = p_match;
  elsif m.period = 'second_half' then update matches set second_half_added = p_minutes where id = p_match;
  else raise exception 'Added time can only be set while a half is being played'; end if;
  insert into match_commentary(match_id, minute, kind, body, created_by)
  values (p_match, case when m.period = 'first_half' then 45 else 90 end, 'added_time',
          p_minutes || ' minute' || case when p_minutes = 1 then '' else 's' end || ' of added time', auth.uid());
end $$;
revoke all on function match_set_added_time(uuid, int) from public;
grant execute on function match_set_added_time(uuid, int) to authenticated;

-- Per-match switch: automatic clock on / off.
create or replace function match_set_auto(p_match uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('matches.manage') then raise exception 'Not allowed'; end if;
  update matches set auto_clock = p_on where id = p_match;
end $$;
revoke all on function match_set_auto(uuid, boolean) from public;
grant execute on function match_set_auto(uuid, boolean) to authenticated;

-- The clock. It only ever moves a match forward according to the time, so it is safe for anyone (and pg_cron) to call:
--   scheduled -> first half at kick-off time -> half time after 45 + added -> second half after the break -> full time after 45 + added.
-- Matches that were due more than 2 hours ago and never started are left alone for staff.
create or replace function matches_auto_tick() returns int
language plpgsql security definer set search_path = public as $$
declare m matches; n int := 0; ht int; soon int; added int; due timestamptz; guard int; rule notification_rules;
        team text; tz text; opp text; vars jsonb;
begin
  if not md_flag('auto_match_clock', true) then return 0; end if;
  ht := md_int('half_time_minutes', 15); soon := md_int('pre_match_minutes', 10); added := md_int('default_added_time', 2);

  -- 1) "Starting soon" push, once per match
  select * into rule from notification_rules where event_key = 'match_starting_soon' and enabled;
  if found then
    select value #>> '{}' into team from site_settings where key = 'team_name';
    select value #>> '{}' into tz from site_settings where key = 'timezone';
    tz := coalesce(tz, 'UTC');
    for m in select * from matches where status = 'scheduled' and starting_soon_sent_at is null
               and kickoff_at > now() and kickoff_at <= now() + make_interval(mins => soon) for update skip locked
    loop
      select name into opp from opponents where id = m.opponent_id;
      vars := jsonb_build_object('team', coalesce(team, ''), 'opponent', coalesce(opp, ''), 'time', to_char(m.kickoff_at at time zone tz, 'HH24:MI'),
                'venue', coalesce(m.venue, case when m.is_home then 'Home' else 'Away' end));
      insert into notification_queue(title, body, data)
      values (render_template(rule.title_template, vars), render_template(rule.body_template, vars), jsonb_build_object('route', '/match/' || m.id));
      update matches set starting_soon_sent_at = now() where id = m.id;
    end loop;
  end if;

  -- 2) The clock
  for m in select * from matches
            where auto_clock and ((status = 'scheduled' and period = 'not_started' and kickoff_at <= now() and kickoff_at > now() - interval '2 hours')
                                  or (status = 'live' and period in ('first_half', 'half_time', 'second_half')))
            for update skip locked
  loop
    guard := 0;
    loop
      guard := guard + 1; exit when guard > 4;
      if m.status = 'scheduled' then
        update matches set status = 'live', period = 'first_half', period_started_at = m.kickoff_at, period_base_minute = 0, first_half_added = added
          where id = m.id returning * into m;
        insert into match_commentary(match_id, minute, kind, body) values (m.id, null, 'kickoff', 'Kick-off!');
      elsif m.period = 'first_half' and now() >= m.period_started_at + make_interval(mins => 45 + m.first_half_added) then
        due := m.period_started_at + make_interval(mins => 45 + m.first_half_added);
        update matches set period = 'half_time', period_started_at = due where id = m.id returning * into m;
        insert into match_commentary(match_id, minute, kind, body) values (m.id, null, 'half_time', 'Half time');
      elsif m.period = 'half_time' and now() >= m.period_started_at + make_interval(mins => ht) then
        due := m.period_started_at + make_interval(mins => ht);
        update matches set period = 'second_half', period_started_at = due, period_base_minute = 45, second_half_added = added
          where id = m.id returning * into m;
        insert into match_commentary(match_id, minute, kind, body) values (m.id, null, 'second_half', 'Second half under way');
      elsif m.period = 'second_half' and now() >= m.period_started_at + make_interval(mins => 45 + m.second_half_added) then
        due := m.period_started_at + make_interval(mins => 45 + m.second_half_added);
        update matches set status = 'finished', period = 'full_time', period_started_at = due,
          goals_for = coalesce(goals_for, 0), goals_against = coalesce(goals_against, 0) where id = m.id returning * into m;
        insert into match_commentary(match_id, minute, kind, body) values (m.id, null, 'full_time', 'Full time');
      else
        exit;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function matches_auto_tick() from public;
grant execute on function matches_auto_tick() to anon, authenticated;

-- Run it every minute on the server so matches start and end even when nobody has the app open.
-- This needs the pg_cron extension (Supabase: Database -> Extensions -> pg_cron). If it is not available here the app still
-- advances the clock whenever someone has the match page or the live console open.
do $$ begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron could not be enabled: %', sqlerrm; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('ss-match-clock'); exception when others then null; end;
    begin perform cron.schedule('ss-match-clock', '* * * * *', 'select public.matches_auto_tick()');
    exception when others then raise notice 'Could not schedule the match clock: %', sqlerrm; end;
  else
    raise notice 'pg_cron is not enabled, so the clock is advanced by the app only. Enable it under Database -> Extensions, then re-run this file.';
  end if;
end $$;

-- Realtime + make the new columns visible to the API straight away
do $$ begin
  begin alter publication supabase_realtime add table matches; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table match_commentary; exception when duplicate_object then null; end;
end $$;
notify pgrst, 'reload schema';
