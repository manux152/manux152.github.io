-- Super Strikers — 044: "Request a friendly match" + automatic match e-mail reminders.
-- Run once in the Supabase SQL Editor. Safe to run again.
--
-- 1. Anyone can ask for a friendly match from /friendly. A team logo is REQUIRED. The request is saved by the
--    `friendly-request` Edge Function (CAPTCHA + rate limits), so the table has no public insert policy.
-- 2. Staff with "matches.manage" review requests in Admin → Friendly requests. Accepting one creates the opponent
--    (with the logo) and a scheduled "Friendly" match in one step.
-- 3. Match reminders by e-mail: every 15 minutes a job e-mails the team before each scheduled match
--    (default 24 hours before; Admin → Site settings key `match_email_reminder_hours`, e.g. [24,2] for two reminders).
--    The wording is editable in Admin → Emails (templates: match_reminder, friendly_match_reminder).

-- ───────── Logo storage (public read; uploads only through the Edge Function) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('friendly-logos', 'friendly-logos', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists "friendly logos read" on storage.objects;
create policy "friendly logos read" on storage.objects for select using (bucket_id = 'friendly-logos');
drop policy if exists "friendly logos delete" on storage.objects;
create policy "friendly logos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'friendly-logos' and has_permission('matches.manage'));

-- ───────── Requests ─────────
create table if not exists friendly_requests (
  id uuid primary key default gen_random_uuid(),
  team_name text not null check (length(trim(team_name)) between 2 and 80),
  age_group text check (length(age_group) <= 40),
  contact_name text not null check (length(trim(contact_name)) between 2 and 80),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(contact_email) <= 200),
  contact_phone text check (length(contact_phone) <= 40),
  date_option_1 date not null,
  date_option_2 date,
  time_note text check (length(time_note) <= 80),
  venue_pref text not null default 'either' check (venue_pref in ('their_ground','our_ground','either')),   -- "their" = the requesting team
  message text check (length(message) <= 1000),
  logo_url text not null check (logo_url ~ '^https://'),                                                    -- the logo is required
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  admin_note text check (length(admin_note) <= 500),
  match_id uuid references matches(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists friendly_requests_status_idx on friendly_requests(status, created_at desc);
alter table friendly_requests enable row level security;
drop policy if exists "manage" on friendly_requests;
create policy "manage" on friendly_requests for all using (has_permission('matches.manage')) with check (has_permission('matches.manage'));

-- Accept: create (or reuse) the opponent, add the match, mark the request accepted. Everything in one step.
create or replace function friendly_accept(p_id uuid, p_kickoff timestamptz, p_venue text, p_is_home boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r friendly_requests; opp uuid; mid uuid;
begin
  if not has_permission('matches.manage') then raise exception 'Forbidden'; end if;
  select * into r from friendly_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been answered'; end if;
  if p_kickoff is null then raise exception 'Choose a date and time'; end if;

  select id into opp from opponents where lower(name) = lower(trim(r.team_name)) limit 1;
  if opp is null then
    insert into opponents(name, logo_url) values (trim(r.team_name), r.logo_url) returning id into opp;
  else
    update opponents set logo_url = r.logo_url where id = opp and logo_url is null;
  end if;

  insert into matches(opponent_id, kickoff_at, venue, is_home, competition, status)
  values (opp, p_kickoff, nullif(trim(coalesce(p_venue, '')), ''), coalesce(p_is_home, true), 'Friendly', 'scheduled')
  returning id into mid;

  update friendly_requests set status = 'accepted', match_id = mid, admin_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  return mid;
end $$;
revoke all on function friendly_accept(uuid, timestamptz, text, boolean, text) from public, anon;
grant execute on function friendly_accept(uuid, timestamptz, text, boolean, text) to authenticated;

-- Decline: records who answered and when (the person is e-mailed by the trigger below).
create or replace function friendly_decline(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('matches.manage') then raise exception 'Forbidden'; end if;
  update friendly_requests set status = 'declined', admin_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_id and status = 'pending';
  if not found then raise exception 'This request has already been answered'; end if;
end $$;
revoke all on function friendly_decline(uuid, text) from public, anon;
grant execute on function friendly_decline(uuid, text) to authenticated;

-- ───────── E-mail templates (all editable in Admin → Emails) ─────────
insert into email_templates(event_key, label, subject, body, button_label, button_url, variables, is_system) values
('friendly_received','Friendly request received (to the requesting team)','We got your friendly match request',
 E'Hi {first_name},\n\nThanks for asking {team} for a friendly match. We received the request for **{their_team}** and will reply by email once we have checked our fixtures.',
 null, null, '{first_name} {name} {team} {their_team} {date_1}', true),
('friendly_new_admin','Friendly request received (to staff)','New friendly match request from {their_team}',
 E'Hi {first_name},\n\n**{their_team}** has asked for a friendly match.\n\nContact: {contact_name} ({contact_email})\nPreferred date: {date_1}\n\nOpen Admin → Friendly requests to accept or decline.',
 'Review the request', '{app_url}/admin/friendlies', '{first_name} {team} {their_team} {contact_name} {contact_email} {date_1} {app_url}', true),
('friendly_accepted','Friendly request accepted (to the requesting team)','Friendly confirmed: {team} vs {their_team}',
 E'Hi {first_name},\n\nGood news: {team} would love to play **{their_team}**.\n\nKick-off: {when}\nVenue: {venue}\n\n{note}',
 null, null, '{first_name} {team} {their_team} {when} {venue} {note}', true),
('friendly_declined','Friendly request declined (to the requesting team)','About your friendly match request',
 E'Hi {first_name},\n\nThank you for asking {team} for a friendly with **{their_team}**. Unfortunately we cannot fit it in this time.\n\n{note}\n\nWe hope to play you another time.',
 null, null, '{first_name} {team} {their_team} {note}', true),
('match_reminder','Match reminder (to the team)','Reminder: {team} vs {opponent} — {countdown}',
 E'Hi {first_name},\n\nA reminder that **{team} vs {opponent}** kicks off {countdown}.\n\nKick-off: {when}\nVenue: {venue} ({home_away})\n\nOpen the app to check your availability and the lineup.',
 'See the match', '{match_url}', '{first_name} {team} {opponent} {when} {countdown} {venue} {home_away} {match_url} {app_url}', true),
('friendly_match_reminder','Friendly match reminder (to the visiting team contact)','Reminder: friendly vs {team} — {countdown}',
 E'Hi {first_name},\n\nA reminder of your friendly against **{team}**, which kicks off {countdown}.\n\nKick-off: {when}\nVenue: {venue}\n\nSee you there!',
 null, null, '{first_name} {team} {their_team} {when} {countdown} {venue}', true)
on conflict (event_key) do nothing;

-- ───────── Friendly request e-mails ─────────
create or replace function friendly_staff_recipients() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', p.email, 'name', p.full_name)), '[]'::jsonb)
  from profiles p where p.is_active and p.email is not null
    and exists (select 1 from user_roles ur join role_permissions rp on rp.role_id = ur.role_id
                where ur.user_id = p.id and rp.permission_key = 'matches.manage');
$$;
revoke execute on function friendly_staff_recipients() from public, anon, authenticated;

create or replace function email_on_friendly_request() returns trigger language plpgsql security definer set search_path = public as $$
declare vars jsonb;
begin
  begin
    vars := jsonb_build_object('their_team', new.team_name, 'contact_name', new.contact_name, 'contact_email', new.contact_email,
                               'date_1', to_char(new.date_option_1, 'FMDay FMDD FMMonth YYYY'));
    perform enqueue_email('friendly_received', new.contact_email, new.contact_name, vars);
    if email_burst_ok('friendly_new_admin') then
      perform enqueue_email_bulk('friendly_new_admin', friendly_staff_recipients(), vars);
    end if;
  exception when others then raise warning 'email_on_friendly_request: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_friendly_request on friendly_requests;
create trigger email_friendly_request after insert on friendly_requests for each row execute function email_on_friendly_request();

create or replace function email_on_friendly_status() returns trigger language plpgsql security definer set search_path = public as $$
declare m matches; vars jsonb;
begin
  begin
    if new.status is not distinct from old.status then return null; end if;
    if new.status = 'accepted' then
      select * into m from matches where id = new.match_id;
      vars := jsonb_build_object('their_team', new.team_name, 'when', coalesce(email_when(m.kickoff_at), ''),
                                 'venue', coalesce(nullif(m.venue, ''), 'To be confirmed'), 'note', coalesce(new.admin_note, ''));
      perform enqueue_email('friendly_accepted', new.contact_email, new.contact_name, vars);
    elsif new.status = 'declined' then
      perform enqueue_email('friendly_declined', new.contact_email, new.contact_name,
        jsonb_build_object('their_team', new.team_name, 'note', coalesce(new.admin_note, '')));
    end if;
  exception when others then raise warning 'email_on_friendly_status: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists email_friendly_status on friendly_requests;
create trigger email_friendly_status after update of status on friendly_requests for each row execute function email_on_friendly_status();

-- ───────── Automatic match reminders by e-mail ─────────
-- One row per match and reminder time, so nobody is e-mailed twice for the same reminder.
create table if not exists match_email_reminders (
  match_id uuid not null references matches(id) on delete cascade,
  hours numeric not null,
  sent_at timestamptz not null default now(),
  primary key (match_id, hours)
);
alter table match_email_reminders enable row level security;   -- no policies on purpose: only server functions use it

-- If the kick-off moves, the reminders for that match start over.
create or replace function reset_email_reminders() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kickoff_at is distinct from old.kickoff_at then delete from match_email_reminders where match_id = new.id; end if;
  return new;
end $$;
drop trigger if exists matches_reset_email_reminders on matches;
create trigger matches_reset_email_reminders after update of kickoff_at on matches for each row execute function reset_email_reminders();

insert into site_settings(key, value) values ('match_email_reminder_hours', '[24]') on conflict (key) do nothing;

create or replace function email_countdown(ts timestamptz) returns text language sql stable set search_path = public as $$
  select case
    when ts - now() < interval '1 hour' then 'in under an hour'
    when ts - now() < interval '36 hours' then 'in about ' || round(extract(epoch from (ts - now())) / 3600)::int || ' hours'
    else 'in ' || round(extract(epoch from (ts - now())) / 86400)::int || ' days'
  end;
$$;

create or replace function queue_match_email_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare
  v jsonb; hrs numeric[]; m record; pick numeric; n int := 0;
  site text := regexp_replace(site_url_setting(), '/+$', ''); recips jsonb; vars jsonb; fr friendly_requests;
begin
  if not exists (select 1 from email_templates where event_key = 'match_reminder' and enabled) then return 0; end if;

  -- reminder times in hours before kick-off: a number (24) or a list ([24,2])
  begin
    select value into v from site_settings where key = 'match_email_reminder_hours';
    if v is null then hrs := array[24];
    elsif jsonb_typeof(v) = 'array' then select array_agg(e::numeric order by e::numeric) into hrs from jsonb_array_elements_text(v) e;
    else hrs := array[(v #>> '{}')::numeric];
    end if;
  exception when others then hrs := array[24]; end;
  if hrs is null or array_length(hrs, 1) is null then return 0; end if;

  recips := team_email_recipients();

  for m in
    select ma.*, o.name as opp from matches ma join opponents o on o.id = ma.opponent_id
    where ma.status = 'scheduled' and ma.kickoff_at > now() and ma.kickoff_at <= now() + (hrs[array_upper(hrs, 1)] * interval '1 hour')
  loop
    begin
      -- the smallest reminder window the match is already inside (so a fixture added late gets one sensible reminder, not several)
      select min(h) into pick from unnest(hrs) h where m.kickoff_at <= now() + (h * interval '1 hour');
      if pick is null then continue; end if;
      insert into match_email_reminders(match_id, hours) values (m.id, pick) on conflict do nothing;
      if not found then continue; end if;

      vars := jsonb_build_object('opponent', m.opp, 'when', email_when(m.kickoff_at), 'countdown', email_countdown(m.kickoff_at),
        'venue', coalesce(nullif(m.venue, ''), 'To be confirmed'), 'home_away', case when m.is_home then 'Home' else 'Away' end,
        'match_url', site || '/match/' || m.id);
      perform enqueue_email_bulk('match_reminder', recips, vars);

      -- a friendly that came from a request: remind the visiting team's contact too
      select * into fr from friendly_requests where match_id = m.id and status = 'accepted';
      if found then
        perform enqueue_email('friendly_match_reminder', fr.contact_email, fr.contact_name,
          jsonb_build_object('their_team', fr.team_name, 'when', vars->>'when', 'countdown', vars->>'countdown', 'venue', vars->>'venue'));
      end if;
      n := n + 1;
    exception when others then raise warning 'queue_match_email_reminders (match %): %', m.id, sqlerrm; end;
  end loop;
  return n;
end $$;
revoke all on function queue_match_email_reminders() from public, anon, authenticated;

-- Button in Admin → Notifications: run the check right now
create or replace function run_match_email_reminders() returns int
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('notifications.manage') then raise exception 'Forbidden'; end if;
  return queue_match_email_reminders();
end $$;
revoke all on function run_match_email_reminders() from public, anon;
grant execute on function run_match_email_reminders() to authenticated;

-- Run it every 15 minutes on the server (needs pg_cron: Database → Extensions). Without pg_cron, use the button above.
do $$ begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron could not be enabled: %', sqlerrm; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('ss-match-email-reminders'); exception when others then null; end;
    begin perform cron.schedule('ss-match-email-reminders', '*/15 * * * *', 'select public.queue_match_email_reminders()');
    exception when others then raise notice 'Could not schedule the e-mail reminders: %', sqlerrm; end;
  else
    raise notice 'pg_cron is not enabled: enable it under Database → Extensions and run this file again.';
  end if;
end $$;

-- ───────── Menu link (hide or rename it any time in Admin → Navigation) ─────────
insert into nav_items (label, route, sort_order, is_visible)
select 'Request a friendly', '/friendly', (select coalesce(max(sort_order), 0) + 1 from nav_items), true
where not exists (select 1 from nav_items where route = '/friendly');
