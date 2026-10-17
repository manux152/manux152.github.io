-- Super Strikers — Phase 40: more automatic emails.
-- The earlier phases already send: welcome, tryout received/shortlisted/declined, team code, registration approved/rejected,
-- order received/status, player availability, lineup published, password reset/changed.
-- This adds: account deactivated / reactivated / deleted, role assigned, registration received,
-- news published, new fixture, full-time result, training session. Every template can be edited or switched off in Admin → Emails.
-- Team-wide emails go only to active team members who have not opted out. A failing email never blocks the action that caused it.

-- ───────── helpers ─────────
create or replace function email_when(ts timestamptz) returns text language sql stable set search_path = public as $$
  select to_char(ts at time zone coalesce((select value #>> '{}' from site_settings where key = 'timezone'), 'UTC'), 'FMDy FMDD FMMon HH24:MI');
$$;

-- Stops a bulk import (for example 20 fixtures at once) from flooding everyone: after 5 of the same email in 10 minutes, the rest are skipped.
create or replace function email_burst_ok(p_key text) returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 5 from email_queue where template_key = p_key and created_at > now() - interval '10 minutes';
$$;
revoke execute on function email_burst_ok(text) from public, anon, authenticated;

create or replace function site_url_setting() returns text language sql stable security definer set search_path = public as $$
  select coalesce(value #>> '{}', '') from site_settings where key = 'site_url';
$$;
revoke execute on function site_url_setting() from public, anon, authenticated;

-- ───────── Templates (all editable in Admin → Emails) ─────────
insert into email_templates(event_key, label, subject, body, button_label, button_url, variables, is_system) values
('account_deactivated','Account deactivated (to the person)','Your {team} account has been deactivated',
 E'Hi {first_name},\n\nYour {team} account has been deactivated. You have been signed out everywhere and can''t sign in until it is reactivated.\n\nIf you think this is a mistake, please contact the team.',
 null,null,'{first_name} {name} {email} {team}',true),
('account_reactivated','Account reactivated (to the person)','Your {team} account is active again',
 E'Hi {first_name},\n\nGood news: your {team} account has been reactivated. You can sign in again.',
 'Sign in','{app_url}/login','{first_name} {name} {email} {team} {app_url}',true),
('account_deleted','Account deleted (to the person)','Your {team} account has been deleted',
 E'Hi {first_name},\n\nYour {team} account, registration and player profile have been deleted, and you have been signed out everywhere.\n\nIf you didn''t expect this, please contact the team.',
 null,null,'{first_name} {name} {email} {team}',true),
('role_assigned','Added to the team / role changed','You''re on the {team} team',
 E'Hi {first_name},\n\nYou have been given the role **{role}** with {team}. You may now see extra pages and tools in the app.',
 'Open the app','{app_url}','{first_name} {name} {email} {team} {role} {app_url}',true),
('registration_received','Player registration received','We received your registration',
 E'Hi {first_name},\n\nThanks for registering with {team}. The coaches will review it and you will get an email as soon as it has been approved or if we need more from you.',
 null,null,'{first_name} {name} {email} {team}',true),
('news_published','Team update: new news post','News from {team}: {title}',
 E'Hi {first_name},\n\nThere is a new post from {team}:\n\n**{title}**\n\n{summary}',
 'Read it','{news_url}','{first_name} {team} {title} {summary} {news_url} {app_url}',true),
('match_scheduled','Team update: new fixture','New fixture: {team} vs {opponent}',
 E'Hi {first_name},\n\nA new match has been added: **{team} vs {opponent}**.\n\nKick-off: {when}\n\nOpen the app to mark your availability.',
 'See the fixture','{match_url}','{first_name} {team} {opponent} {when} {match_url} {app_url}',true),
('match_result','Team update: full-time result','Full time: {team} {goals_for}–{goals_against} {opponent}',
 E'Hi {first_name},\n\nFull time: **{team} {goals_for}–{goals_against} {opponent}** ({result_label}).\n\nOpen the app for the match report and stats.',
 'See the match','{match_url}','{first_name} {team} {opponent} {goals_for} {goals_against} {result_label} {match_url} {app_url}',true),
('training_scheduled','Team update: new training session','Training: {title}',
 E'Hi {first_name},\n\nA training session has been scheduled.\n\n**{title}**\nWhen: {when}\n{focus}',
 'Open the app','{app_url}','{first_name} {team} {title} {when} {focus} {app_url}',true)
on conflict (event_key) do nothing;

-- ───────── Account deactivated / reactivated ─────────
create or replace function email_on_account_active() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.is_active is false and old.is_active is distinct from false then
      perform enqueue_email('account_deactivated', new.email, new.full_name, '{}', new.id);
    elsif new.is_active is true and old.is_active is distinct from true then
      perform enqueue_email('account_reactivated', new.email, new.full_name, '{}', new.id);
    end if;
  exception when others then raise warning 'email_on_account_active: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_account_active on profiles;
create trigger email_account_active after update of is_active on profiles for each row execute function email_on_account_active();

-- ───────── Account deleted (the address is read before the account disappears) ─────────
create or replace function email_on_account_deleted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin perform enqueue_email('account_deleted', old.email, old.full_name, '{}', null);
  exception when others then raise warning 'email_on_account_deleted: %', sqlerrm; end;
  return old;
end $$;
drop trigger if exists email_account_deleted on profiles;
create trigger email_account_deleted before delete on profiles for each row execute function email_on_account_deleted();

-- ───────── Role assigned (skipped while the account is brand new, because the welcome email covers that) ─────────
create or replace function email_on_role_assigned() returns trigger language plpgsql security definer set search_path = public as $$
declare p profiles; rname text;
begin
  begin
    select * into p from profiles where id = new.user_id;
    if not found or p.is_active is not true or p.created_at > now() - interval '2 minutes' then return null; end if;
    select name into rname from roles where id = new.role_id;
    perform enqueue_email('role_assigned', p.email, p.full_name, jsonb_build_object('role', coalesce(rname, 'team member')), p.id);
  exception when others then raise warning 'email_on_role_assigned: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_role_assigned on user_roles;
create trigger email_role_assigned after insert on user_roles for each row execute function email_on_role_assigned();

-- ───────── Registration received ─────────
create or replace function email_on_registration_received() returns trigger language plpgsql security definer set search_path = public as $$
declare em text; nm text;
begin
  begin
    select email, full_name into em, nm from profiles where id = new.user_id;
    perform enqueue_email('registration_received', em, nm, '{}', new.user_id);
  exception when others then raise warning 'email_on_registration_received: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_registration_received on registrations;
create trigger email_registration_received after insert on registrations for each row execute function email_on_registration_received();

-- ───────── News published (same rules as the push notification: live now, not a draft, first time only) ─────────
create or replace function email_on_news() returns trigger language plpgsql security definer set search_path = public as $$
declare site text := regexp_replace(site_url_setting(), '/+$', '');
begin
  begin
    if new.published_at is null or new.published_at > now() then return null; end if;
    if tg_op = 'UPDATE' and old.published_at is not null and old.published_at <= now() then return null; end if;
    if not email_burst_ok('news_published') then return null; end if;
    perform enqueue_email_bulk('news_published', team_email_recipients(),
      jsonb_build_object('title', new.title, 'summary', coalesce(new.summary, ''), 'news_url', site || '/news/' || new.slug));
  exception when others then raise warning 'email_on_news: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_news on news_posts;
create trigger email_news after insert or update of published_at on news_posts for each row execute function email_on_news();

-- ───────── New fixture ─────────
create or replace function email_on_match_scheduled() returns trigger language plpgsql security definer set search_path = public as $$
declare opp text; site text := regexp_replace(site_url_setting(), '/+$', '');
begin
  begin
    if new.status is distinct from 'scheduled' or new.kickoff_at < now() then return null; end if;
    if not email_burst_ok('match_scheduled') then return null; end if;
    select name into opp from opponents where id = new.opponent_id;
    perform enqueue_email_bulk('match_scheduled', team_email_recipients(),
      jsonb_build_object('opponent', coalesce(opp, 'TBC'), 'when', email_when(new.kickoff_at), 'match_url', site || '/match/' || new.id));
  exception when others then raise warning 'email_on_match_scheduled: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_match_scheduled on matches;
create trigger email_match_scheduled after insert on matches for each row execute function email_on_match_scheduled();

-- ───────── Full-time result ─────────
create or replace function email_on_match_result() returns trigger language plpgsql security definer set search_path = public as $$
declare opp text; res text; site text := regexp_replace(site_url_setting(), '/+$', '');
begin
  begin
    if new.status is distinct from 'finished' or old.status is not distinct from 'finished' then return null; end if;
    if not email_burst_ok('match_result') then return null; end if;
    select name into opp from opponents where id = new.opponent_id;
    res := case when coalesce(new.goals_for, 0) > coalesce(new.goals_against, 0) then 'a win' when coalesce(new.goals_for, 0) < coalesce(new.goals_against, 0) then 'a defeat' else 'a draw' end;
    perform enqueue_email_bulk('match_result', team_email_recipients(),
      jsonb_build_object('opponent', coalesce(opp, ''), 'goals_for', coalesce(new.goals_for, 0), 'goals_against', coalesce(new.goals_against, 0),
        'result_label', res, 'match_url', site || '/match/' || new.id));
  exception when others then raise warning 'email_on_match_result: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_match_result on matches;
create trigger email_match_result after update of status on matches for each row execute function email_on_match_result();

-- ───────── Training session (only sessions shared with the whole team) ─────────
create or replace function email_on_training() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.visibility is distinct from 'team' or new.session_date < now() then return null; end if;
    if not email_burst_ok('training_scheduled') then return null; end if;
    perform enqueue_email_bulk('training_scheduled', team_email_recipients(),
      jsonb_build_object('title', new.title, 'when', email_when(new.session_date), 'focus', case when coalesce(new.focus, '') = '' then '' else 'Focus: ' || new.focus end));
  exception when others then raise warning 'email_on_training: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_training on training_sessions;
create trigger email_training after insert on training_sessions for each row execute function email_on_training();
