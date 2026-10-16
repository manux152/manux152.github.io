-- Super Strikers — Phase 29: the automatic match clock heals itself, and a match's status and clock can no longer disagree.
-- Safe to run more than once. Run after 026.

-- Whenever a match's status is changed (by the admin forms, the live console or the clock), keep the clock fields in step with it.
create or replace function matches_status_sync() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'scheduled' then                       -- put back to "scheduled": start over
      new.period := 'not_started'; new.period_started_at := null; new.period_base_minute := 0;
      new.first_half_added := 0; new.second_half_added := 0; new.starting_soon_sent_at := null;
    elsif new.status = 'finished' and new.period is distinct from 'full_time' then
      new.period := 'full_time'; new.period_started_at := coalesce(new.period_started_at, now());
    elsif new.status = 'live' and new.period in ('not_started', 'full_time') then   -- set to "live" by hand: first half starts now
      new.period := 'first_half'; new.period_started_at := now(); new.period_base_minute := 0;
      new.first_half_added := md_int('default_added_time', 2); new.second_half_added := 0;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists matches_status_sync on matches;
create trigger matches_status_sync before update of status on matches for each row execute function matches_status_sync();

create or replace function matches_auto_tick() returns int
language plpgsql security definer set search_path = public as $$
declare m matches; n int := 0; ht int; soon int; added int; due timestamptz; guard int; rule notification_rules;
        team text; tz text; opp text; vars jsonb;
begin
  if not md_flag('auto_match_clock', true) then return 0; end if;
  ht := md_int('half_time_minutes', 15); soon := md_int('pre_match_minutes', 10); added := md_int('default_added_time', 2);

  -- 0) Self-heal rows left in an impossible state (for example after a status was edited by hand while testing)
  update matches set status = 'finished', goals_for = coalesce(goals_for, 0), goals_against = coalesce(goals_against, 0)
    where status = 'live' and period = 'full_time';
  update matches set period = 'first_half', period_base_minute = 0, first_half_added = added,
         period_started_at = greatest(kickoff_at, now() - interval '2 hours')
    where status = 'live' and period = 'not_started';
  update matches set period = 'not_started', period_started_at = null where status = 'scheduled' and period <> 'not_started';

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

-- Make sure the server clock job exists (needs pg_cron; the app also nudges the clock whenever a match page or the Matches list is open)
do $$ begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron could not be enabled: %', sqlerrm; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('ss-match-clock'); exception when others then null; end;
    begin perform cron.schedule('ss-match-clock', '* * * * *', 'select public.matches_auto_tick()');
    exception when others then raise notice 'Could not schedule the match clock: %', sqlerrm; end;
  end if;
end $$;
select public.matches_auto_tick();
notify pgrst, 'reload schema';
