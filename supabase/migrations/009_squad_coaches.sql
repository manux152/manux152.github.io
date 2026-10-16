-- Super Strikers — Phase 9a: profile photos, formations, lineups, availability, training notes

-- ═════════ PROFILES & PLAYER DETAILS ═════════
alter table profiles add column if not exists avatar_url text;
alter table players add column if not exists height_cm int check (height_cm between 100 and 250);
alter table players add column if not exists preferred_foot text check (preferred_foot in ('left','right','both'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Players edit only their own photo/height/foot/bio (jersey number and position stay with coaches)
create or replace function update_my_player_profile(p_photo text default null, p_height int default null, p_foot text default null, p_bio text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_photo is not null and p_photo not like '%/storage/v1/object/public/avatars/' || auth.uid()::text || '/%' then
    raise exception 'Photo must be uploaded through the app';
  end if;
  if p_height is not null and (p_height < 100 or p_height > 250) then raise exception 'Height must be between 100 and 250 cm'; end if;
  if p_foot is not null and p_foot not in ('left','right','both') then raise exception 'Invalid foot'; end if;
  if p_photo is not null then update profiles set avatar_url = p_photo where id = auth.uid(); end if;
  update players set photo_url = coalesce(p_photo, photo_url), height_cm = coalesce(p_height, height_cm),
    preferred_foot = coalesce(p_foot, preferred_foot), bio = coalesce(left(p_bio, 600), bio)
  where profile_id = auth.uid();
end $$;

-- ═════════ PERMISSIONS ═════════
insert into permissions(key, description) values
  ('team.view','See team-only content (availability, training notes, formations)'),
  ('lineups.manage','Build lineups, formations and set availability for players'),
  ('training.manage','Write and edit training sessions and notes');
insert into role_permissions select r.id, p.key from roles r join permissions p on p.key in ('team.view','lineups.manage','training.manage') where r.name in ('Admin','Manager','Coach');
insert into role_permissions select r.id, 'team.view' from roles r where r.name = 'Player';

-- ═════════ FORMATIONS ═════════
create table formations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null default '11-a-side',
  positions jsonb not null,            -- [{key,label,x,y}] x/y in % of the pitch (y=0 opponent goal, 100 own goal)
  description text, how_to_use text, strengths text, weaknesses text,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name, format)
);
insert into formations(name, format, description, how_to_use, strengths, weaknesses, positions) values
($$4-4-2$$,$$11-a-side$$,$$Two banks of four with two strikers up front — the classic, easy-to-read shape.$$,$$Use it when you want balance and clear roles, especially if you have two strikers who work well together. Wide midfielders must track back to help the full-backs, and the central pair protect the middle.$$,$$Balanced and solid; easy to organise; natural width; a ready-made strike partnership.$$,$$Can be outnumbered in central midfield by three-man midfields; depends on fit wide midfielders.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "LB", "x": 12, "y": 74}, {"key": "D1_2", "label": "CB", "x": 37, "y": 74}, {"key": "D1_3", "label": "CB", "x": 63, "y": 74}, {"key": "D1_4", "label": "RB", "x": 88, "y": 74}, {"key": "M2_1", "label": "LM", "x": 12, "y": 44}, {"key": "M2_2", "label": "CM", "x": 37, "y": 44}, {"key": "M2_3", "label": "CM", "x": 63, "y": 44}, {"key": "M2_4", "label": "RM", "x": 88, "y": 44}, {"key": "F3_1", "label": "ST", "x": 35, "y": 14}, {"key": "F3_2", "label": "ST", "x": 65, "y": 14}]'::jsonb),
($$4-3-3$$,$$11-a-side$$,$$Back four, a midfield three and a front three made of two wingers and a centre-forward.$$,$$Use it to dominate the ball and press high. Needs an anchor midfielder to protect the defence and wingers who both attack and defend.$$,$$Width and many attacking options; strong pressing triangles; extra numbers in midfield.$$,$$Space behind the full-backs; the lone centre-forward can be isolated; demands high fitness.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "LB", "x": 12, "y": 74}, {"key": "D1_2", "label": "CB", "x": 37, "y": 74}, {"key": "D1_3", "label": "CB", "x": 63, "y": 74}, {"key": "D1_4", "label": "RB", "x": 88, "y": 74}, {"key": "M2_1", "label": "CM", "x": 20, "y": 44}, {"key": "M2_2", "label": "CM", "x": 50, "y": 44}, {"key": "M2_3", "label": "CM", "x": 80, "y": 44}, {"key": "F3_1", "label": "LW", "x": 20, "y": 14}, {"key": "F3_2", "label": "ST", "x": 50, "y": 14}, {"key": "F3_3", "label": "RW", "x": 80, "y": 14}]'::jsonb),
($$4-2-3-1$$,$$11-a-side$$,$$Back four, two holding midfielders, three attacking midfielders behind a single striker.$$,$$Use it when you have a creative number 10 and want cover in front of the defence. Good for controlling games and for counter-attacks.$$,$$Defensive cover from the double pivot; flexible attacking trio; smooth transitions.$$,$$The striker can be isolated; relies heavily on one creative player in the middle.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "LB", "x": 12, "y": 74}, {"key": "D1_2", "label": "CB", "x": 37, "y": 74}, {"key": "D1_3", "label": "CB", "x": 63, "y": 74}, {"key": "D1_4", "label": "RB", "x": 88, "y": 74}, {"key": "M2_1", "label": "DM", "x": 35, "y": 54}, {"key": "M2_2", "label": "DM", "x": 65, "y": 54}, {"key": "M3_1", "label": "LW", "x": 20, "y": 34}, {"key": "M3_2", "label": "AM", "x": 50, "y": 34}, {"key": "M3_3", "label": "RW", "x": 80, "y": 34}, {"key": "F4_1", "label": "ST", "x": 50, "y": 14}]'::jsonb),
($$3-5-2$$,$$11-a-side$$,$$Three centre-backs, wing-backs providing width, three central midfielders and two strikers.$$,$$Use it when you have energetic wing-backs and three comfortable centre-backs. Strong against teams with one striker and when you want to control the middle.$$,$$Midfield control; two strikers; width from the wing-backs.$$,$$Wing-backs cover huge distances; the wide areas are exposed if they are beaten.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "CB", "x": 20, "y": 74}, {"key": "D1_2", "label": "CB", "x": 50, "y": 74}, {"key": "D1_3", "label": "CB", "x": 80, "y": 74}, {"key": "M2_1", "label": "LM", "x": 8, "y": 44}, {"key": "M2_2", "label": "CM", "x": 29, "y": 44}, {"key": "M2_3", "label": "CM", "x": 50, "y": 44}, {"key": "M2_4", "label": "CM", "x": 71, "y": 44}, {"key": "M2_5", "label": "RM", "x": 92, "y": 44}, {"key": "F3_1", "label": "ST", "x": 35, "y": 14}, {"key": "F3_2", "label": "ST", "x": 65, "y": 14}]'::jsonb),
($$3-4-3$$,$$11-a-side$$,$$Three at the back, a flat midfield four and three forwards — an attacking shape.$$,$$Use it when chasing a game or facing weaker opponents. Needs athletic wide players who can get up and down the pitch.$$,$$Lots of attackers; high pressing; overloads in the final third.$$,$$Vulnerable to counter-attacks; wide areas exposed; demands fitness and discipline.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "CB", "x": 20, "y": 74}, {"key": "D1_2", "label": "CB", "x": 50, "y": 74}, {"key": "D1_3", "label": "CB", "x": 80, "y": 74}, {"key": "M2_1", "label": "LM", "x": 12, "y": 44}, {"key": "M2_2", "label": "CM", "x": 37, "y": 44}, {"key": "M2_3", "label": "CM", "x": 63, "y": 44}, {"key": "M2_4", "label": "RM", "x": 88, "y": 44}, {"key": "F3_1", "label": "LW", "x": 20, "y": 14}, {"key": "F3_2", "label": "ST", "x": 50, "y": 14}, {"key": "F3_3", "label": "RW", "x": 80, "y": 14}]'::jsonb),
($$5-3-2$$,$$11-a-side$$,$$Five defenders including wing-backs, a midfield three and two strikers.$$,$$Use it to protect a lead or face stronger opponents, then hit on the counter with the two strikers.$$,$$Very hard to break down; strong in the air; a ready counter-attacking pair.$$,$$Can become passive; fewer players in midfield; limited attacking support.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "LWB", "x": 8, "y": 74}, {"key": "D1_2", "label": "CB", "x": 29, "y": 74}, {"key": "D1_3", "label": "CB", "x": 50, "y": 74}, {"key": "D1_4", "label": "CB", "x": 71, "y": 74}, {"key": "D1_5", "label": "RWB", "x": 92, "y": 74}, {"key": "M2_1", "label": "CM", "x": 20, "y": 44}, {"key": "M2_2", "label": "CM", "x": 50, "y": 44}, {"key": "M2_3", "label": "CM", "x": 80, "y": 44}, {"key": "F3_1", "label": "ST", "x": 35, "y": 14}, {"key": "F3_2", "label": "ST", "x": 65, "y": 14}]'::jsonb),
($$4-1-4-1$$,$$11-a-side$$,$$Back four, one holding midfielder, a flat four in midfield and a lone striker.$$,$$Use it to keep a compact shape with a midfielder shielding the back four. Good against teams that attack through the middle.$$,$$Compact and organised; protects the defence; many players in midfield.$$,$$The striker is isolated; goals depend on midfield runners.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "LB", "x": 12, "y": 74}, {"key": "D1_2", "label": "CB", "x": 37, "y": 74}, {"key": "D1_3", "label": "CB", "x": 63, "y": 74}, {"key": "D1_4", "label": "RB", "x": 88, "y": 74}, {"key": "M2_1", "label": "DM", "x": 50, "y": 54}, {"key": "M3_1", "label": "LM", "x": 12, "y": 34}, {"key": "M3_2", "label": "CM", "x": 37, "y": 34}, {"key": "M3_3", "label": "CM", "x": 63, "y": 34}, {"key": "M3_4", "label": "RM", "x": 88, "y": 34}, {"key": "F4_1", "label": "ST", "x": 50, "y": 14}]'::jsonb),
($$4-5-1$$,$$11-a-side$$,$$Back four, five midfielders and one striker — compact and hard to play through.$$,$$Use it away from home or against stronger opponents. Midfielders must support the striker by running beyond him.$$,$$Very compact; difficult to play through the middle; easy to defend in numbers.$$,$$Few attackers; can invite pressure if the midfield sits too deep.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "LB", "x": 12, "y": 74}, {"key": "D1_2", "label": "CB", "x": 37, "y": 74}, {"key": "D1_3", "label": "CB", "x": 63, "y": 74}, {"key": "D1_4", "label": "RB", "x": 88, "y": 74}, {"key": "M2_1", "label": "LM", "x": 8, "y": 44}, {"key": "M2_2", "label": "CM", "x": 29, "y": 44}, {"key": "M2_3", "label": "CM", "x": 50, "y": 44}, {"key": "M2_4", "label": "CM", "x": 71, "y": 44}, {"key": "M2_5", "label": "RM", "x": 92, "y": 44}, {"key": "F3_1", "label": "ST", "x": 50, "y": 14}]'::jsonb),
($$3-3-2$$,$$9-a-side$$,$$Goalkeeper, three defenders, three midfielders and two forwards.$$,$$A balanced 9-a-side shape: three at the back cover the width, the midfield three link play and two forwards stretch the opposition.$$,$$Solid and balanced; two attackers to share the work.$$,$$Midfielders have a lot of ground to cover on a larger pitch.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "CB", "x": 20, "y": 74}, {"key": "D1_2", "label": "CB", "x": 50, "y": 74}, {"key": "D1_3", "label": "CB", "x": 80, "y": 74}, {"key": "M2_1", "label": "CM", "x": 20, "y": 44}, {"key": "M2_2", "label": "CM", "x": 50, "y": 44}, {"key": "M2_3", "label": "CM", "x": 80, "y": 44}, {"key": "F3_1", "label": "ST", "x": 35, "y": 14}, {"key": "F3_2", "label": "ST", "x": 65, "y": 14}]'::jsonb),
($$2-3-1$$,$$7-a-side$$,$$Goalkeeper, two defenders, three midfielders and one striker.$$,$$A flexible 7-a-side shape: the midfield three create triangles, the striker holds the ball up and the two defenders stay compact.$$,$$Good passing triangles; balanced across the pitch.$$,$$Only two defenders, so midfielders must track back quickly.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "CB", "x": 35, "y": 74}, {"key": "D1_2", "label": "CB", "x": 65, "y": 74}, {"key": "M2_1", "label": "CM", "x": 20, "y": 44}, {"key": "M2_2", "label": "CM", "x": 50, "y": 44}, {"key": "M2_3", "label": "CM", "x": 80, "y": 44}, {"key": "F3_1", "label": "ST", "x": 50, "y": 14}]'::jsonb),
($$3-2-1$$,$$7-a-side$$,$$Goalkeeper, three defenders, two midfielders and one striker — a cautious 7-a-side shape.$$,$$Use it to defend a lead or when your defenders are your strongest players; the striker works on the break.$$,$$Very secure at the back.$$,$$Few attackers and little support for the striker.$$,'[{"key": "GK", "label": "GK", "x": 50, "y": 92}, {"key": "D1_1", "label": "CB", "x": 20, "y": 74}, {"key": "D1_2", "label": "CB", "x": 50, "y": 74}, {"key": "D1_3", "label": "CB", "x": 80, "y": 74}, {"key": "M2_1", "label": "CM", "x": 35, "y": 44}, {"key": "M2_2", "label": "CM", "x": 65, "y": 44}, {"key": "F3_1", "label": "ST", "x": 50, "y": 14}]'::jsonb);
alter table formations enable row level security;
create policy "public read" on formations for select using (is_active or has_permission('lineups.manage'));
create policy "manage" on formations for all using (has_permission('lineups.manage'));

-- ═════════ LINEUPS ═════════
create table lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid unique not null references matches(id) on delete cascade,
  formation_id uuid references formations(id) on delete set null,
  notes text,
  is_published boolean not null default false,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table lineup_players (
  lineup_id uuid references lineups(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  slot_key text,                       -- null = on the bench
  sort_order int not null default 0,
  primary key (lineup_id, player_id)
);
create unique index lineup_slot_unique on lineup_players(lineup_id, slot_key) where slot_key is not null;
alter table lineups enable row level security;
alter table lineup_players enable row level security;
create policy "read published" on lineups for select using (is_published or has_permission('lineups.manage'));
create policy "manage" on lineups for all using (has_permission('lineups.manage'));
create policy "read published" on lineup_players for select using (
  exists (select 1 from lineups l where l.id = lineup_id and (l.is_published or has_permission('lineups.manage'))));
create policy "manage" on lineup_players for all using (has_permission('lineups.manage'));

-- ═════════ AVAILABILITY ═════════
create table match_availability (
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  status text not null check (status in ('available','unavailable')),
  note text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (match_id, player_id)
);
alter table match_availability enable row level security;
create policy "team read" on match_availability for select using (has_permission('team.view') or has_permission('lineups.manage'));
create policy "own write" on match_availability for insert to authenticated
  with check (exists (select 1 from players p where p.id = player_id and p.profile_id = auth.uid()));
create policy "own update" on match_availability for update to authenticated
  using (exists (select 1 from players p where p.id = player_id and p.profile_id = auth.uid()))
  with check (exists (select 1 from players p where p.id = player_id and p.profile_id = auth.uid()));
create policy "manage" on match_availability for all using (has_permission('lineups.manage'));

-- ═════════ TRAINING NOTES ═════════
create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  session_date timestamptz not null,
  focus text,
  plan text,
  notes text,
  visibility text not null default 'staff' check (visibility in ('staff','team')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index training_date_idx on training_sessions(session_date desc);
alter table training_sessions enable row level security;
create policy "read" on training_sessions for select using (
  has_permission('training.manage') or (visibility = 'team' and has_permission('team.view')));
create policy "manage" on training_sessions for all using (has_permission('training.manage'));

-- ═════════ NOTIFICATIONS: bulk email helper + rules + templates ═════════
alter table email_queue add column if not exists recipients jsonb;   -- one row can carry many recipients (sent as a single batch)
create or replace function enqueue_email_bulk(p_key text, p_recipients jsonb, p_vars jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare on_ boolean; team text; url text;
begin
  select emails_enabled into on_ from email_settings where id = 1;
  if coalesce(on_, true) = false or p_recipients is null or jsonb_array_length(p_recipients) = 0 then return; end if;
  if not exists (select 1 from email_templates where event_key = p_key and enabled) then return; end if;
  select value #>> '{}' into team from site_settings where key = 'team_name';
  select value #>> '{}' into url from site_settings where key = 'site_url';
  insert into email_queue(template_key, to_email, recipients, vars)
  values (p_key, '(bulk)', p_recipients, jsonb_build_object('team', coalesce(team,''), 'app_url', coalesce(url,'')) || coalesce(p_vars,'{}'));
end $$;
revoke execute on function enqueue_email_bulk(text,jsonb,jsonb) from public, anon, authenticated;

-- Everyone on the team (active accounts with a role) who has not opted out of team emails
create or replace function team_email_recipients() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', p.email, 'name', p.full_name)), '[]'::jsonb)
  from profiles p where p.is_active and p.email is not null and not p.email_opt_out
    and exists (select 1 from user_roles ur where ur.user_id = p.id);
$$;
revoke execute on function team_email_recipients() from public, anon, authenticated;

insert into notification_rules(event_key, label, title_template, body_template) values
  ('availability_changed','Player availability changed','{player} is {status}','vs {opponent} · {when}'),
  ('lineup_published','Lineup announced','Lineup announced','vs {opponent} · {when}') on conflict do nothing;
insert into email_templates(event_key, label, subject, body, button_label, button_url, variables, is_system) values
('availability_changed','Player availability changed','{player} is {status} — {opponent}',
 E'Hi {first_name},\n\n**{player}** is now marked **{status}** for the match against {opponent} on {when}.\n\nOpen the app to see the full squad availability.',
 'Open the app','{app_url}','{first_name} {team} {player} {status} {opponent} {when} {app_url}',true),
('lineup_published','Lineup announced','Lineup announced: {team} vs {opponent}',
 E'Hi {first_name},\n\nThe lineup for {team} vs {opponent} on {when} is out. Open the app to see who''s starting.',
 'See the lineup','{app_url}','{first_name} {team} {opponent} {when} {app_url}',true) on conflict do nothing;

create or replace function notify_availability() returns trigger language plpgsql security definer set search_path = public as $$
declare m record; pname text; tz text; vars jsonb; rule notification_rules; st text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  if tg_op = 'UPDATE' and old.notified_at is not null and old.notified_at > now() - interval '60 seconds' then return null; end if;
  select ma.kickoff_at, ma.status, o.name as opp into m from matches ma join opponents o on o.id = ma.opponent_id where ma.id = new.match_id;
  if m.status <> 'scheduled' or m.kickoff_at < now() then return null; end if;
  select full_name into pname from players where id = new.player_id;
  select value #>> '{}' into tz from site_settings where key = 'timezone'; tz := coalesce(tz, 'UTC');
  st := new.status;
  vars := jsonb_build_object('player', pname, 'status', st, 'opponent', m.opp,
            'when', to_char(m.kickoff_at at time zone tz, 'FMDy FMDD FMMon HH24:MI'));
  select * into rule from notification_rules where event_key = 'availability_changed' and enabled;
  if found then
    insert into notification_queue(title, body, data)
    values (render_template(rule.title_template, vars), render_template(rule.body_template, vars), jsonb_build_object('route','/match/' || new.match_id));
  end if;
  perform enqueue_email_bulk('availability_changed', team_email_recipients(), vars);
  update match_availability set notified_at = now() where match_id = new.match_id and player_id = new.player_id;
  return null;
end $$;
create trigger availability_notify after insert or update of status on match_availability for each row execute function notify_availability();

create or replace function notify_lineup() returns trigger language plpgsql security definer set search_path = public as $$
declare m record; tz text; vars jsonb; rule notification_rules;
begin
  if not new.is_published or (tg_op = 'UPDATE' and old.is_published) then return null; end if;
  select ma.kickoff_at, o.name as opp into m from matches ma join opponents o on o.id = ma.opponent_id where ma.id = new.match_id;
  select value #>> '{}' into tz from site_settings where key = 'timezone'; tz := coalesce(tz, 'UTC');
  vars := jsonb_build_object('opponent', m.opp, 'when', to_char(m.kickoff_at at time zone tz, 'FMDy FMDD FMMon HH24:MI'));
  select * into rule from notification_rules where event_key = 'lineup_published' and enabled;
  if found then
    insert into notification_queue(title, body, data)
    values (render_template(rule.title_template, vars), render_template(rule.body_template, vars), jsonb_build_object('route','/match/' || new.match_id));
  end if;
  perform enqueue_email_bulk('lineup_published', team_email_recipients(), vars);
  return null;
end $$;
create trigger lineup_notify after insert or update of is_published on lineups for each row execute function notify_lineup();

-- Navigation
insert into nav_items(label, route, sort_order, required_permission) values
  ('Formations','/formations',12,'team.view'), ('Training','/training',13,'team.view');
