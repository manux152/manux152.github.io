-- Super Strikers — Phase 6: predictions, calendar, awards, legal pages, security + performance hardening

-- ═════════ SECURITY ═════════
-- Deactivated accounts lose all permissions
create or replace function has_permission(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    join profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and rp.permission_key = perm and p.is_active
  );
$$;

-- Users may edit their own profile, but not reactivate themselves or change identity fields
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not has_permission('users.manage') then
    new.id := old.id; new.email := old.email; new.is_active := old.is_active;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_update();

-- Built-in roles cannot be deleted
create or replace function guard_system_role() returns trigger language plpgsql as $$
begin
  if old.is_system then raise exception 'Built-in roles cannot be deleted'; end if;
  return old;
end $$;
create trigger roles_guard before delete on roles for each row execute function guard_system_role();

-- Player date of birth / contact details were publicly readable: move them to a private table
create table player_private (
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique not null references players(id) on delete cascade,
  date_of_birth date,
  phone text,
  emergency_contact text
);
insert into player_private(player_id, date_of_birth)
  select id, date_of_birth from players where date_of_birth is not null;
alter table players drop column date_of_birth;
alter table player_private enable row level security;
create policy "manage" on player_private for all using (has_permission('players.manage'));
create policy "own" on player_private for select to authenticated
  using (exists (select 1 from players p where p.id = player_id and p.profile_id = auth.uid()));

-- Audit log of sensitive changes
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references profiles(id) on delete set null,
  table_name text not null,
  op text not null,
  row_pk text,
  old_data jsonb,
  new_data jsonb
);
create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into audit_log(actor, table_name, op, row_pk, old_data, new_data)
  values (auth.uid(), tg_table_name, tg_op, coalesce(n->>'id', o->>'id', n->>'key', o->>'key'), o, n);
  return null;
end $$;
create trigger audit after insert or update or delete on user_roles for each row execute function log_change();
create trigger audit after insert or update or delete on roles for each row execute function log_change();
create trigger audit after insert or update or delete on role_permissions for each row execute function log_change();
create trigger audit after insert or update or delete on site_settings for each row execute function log_change();
create trigger audit after insert or update or delete on api_providers for each row execute function log_change();
create trigger audit after update or delete on profiles for each row execute function log_change();
create trigger audit after update on registrations for each row execute function log_change();
create trigger audit after delete on players for each row execute function log_change();
alter table audit_log enable row level security;
create policy "read" on audit_log for select using (has_permission('audit.view'));

-- ═════════ PERFORMANCE ═════════
create index if not exists matches_kickoff_idx on matches(kickoff_at desc);
create index if not exists matches_status_idx on matches(status);
create index if not exists news_published_idx on news_posts(published_at desc);
create index if not exists players_active_idx on players(is_active, shirt_number);
create index if not exists match_players_player_idx on match_players(player_id);
create index if not exists match_events_player_idx on match_events(player_id);
create index if not exists match_events_related_idx on match_events(related_player_id);
create index if not exists push_tokens_user_idx on push_tokens(user_id);
create index if not exists queue_status_idx on notification_queue(status, created_at desc);
create index if not exists audit_at_idx on audit_log(at desc);

-- ═════════ PREDICTIONS ═════════
create table match_predictions (
  match_id uuid primary key references matches(id) on delete cascade,
  win_pct int not null, draw_pct int not null, loss_pct int not null,
  expected_goals_for numeric(4,2), expected_goals_against numeric(4,2),
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  basis text,
  rationale text,
  generated_at timestamptz not null default now()
);
alter table match_predictions enable row level security;
create policy "public read" on match_predictions for select using (true);
create policy "manage" on match_predictions for all using (has_permission('matches.manage'));
insert into site_settings(key, value) values ('predictions_enabled','true'), ('max_tabs','5') on conflict do nothing;

-- ═════════ CALENDAR ═════════
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  category text,                       -- Training, Social, Meeting...
  repeat text not null default 'none' check (repeat in ('none','weekly')),
  repeat_until date,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index events_start_idx on events(starts_at);
alter table events enable row level security;
create policy "public read" on events for select using (is_published or has_permission('events.manage'));
create policy "manage" on events for all using (has_permission('events.manage'));

-- ═════════ AWARDS ═════════
create table award_types (
  id uuid primary key default gen_random_uuid(),
  label text unique not null,
  sort_order int not null default 0
);
create table awards (
  id uuid primary key default gen_random_uuid(),
  award_type_id uuid not null references award_types(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  period_label text not null,          -- e.g. "October 2026"
  awarded_on date not null default current_date,
  note text,
  is_published boolean not null default true
);
create index awards_date_idx on awards(awarded_on desc);
alter table award_types enable row level security;
alter table awards enable row level security;
create policy "public read" on award_types for select using (true);
create policy "public read" on awards for select using (is_published or has_permission('awards.manage'));
create policy "manage" on award_types for all using (has_permission('awards.manage'));
create policy "manage" on awards for all using (has_permission('awards.manage'));
insert into award_types(label, sort_order) values ('Player of the Month',1), ('Goal of the Month',2), ('Young Player of the Month',3);

-- ═════════ LEGAL / INFO PAGES (needed for app-store review) ═════════
create table pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  body text not null,
  is_published boolean not null default true,
  sort_order int not null default 0
);
alter table pages enable row level security;
create policy "public read" on pages for select using (is_published or has_permission('pages.manage'));
create policy "manage" on pages for all using (has_permission('pages.manage'));
insert into pages(slug, title, body, sort_order) values
 ('privacy','Privacy policy',
  E'DRAFT — replace this text with your own policy and have it reviewed before publishing.\n\nWhat we collect: your email, name and any details you give when registering as a player, plus a notification token if you turn on push notifications.\nWhy: to run the team app, manage the squad and send team updates.\nWho can see it: team administrators. Your player name, number, photo and statistics appear publicly if you are on the roster.\nYour choices: you can turn notifications off, and delete your account (and player profile) from Account → Delete my account.\nContact: add your team contact email here.',1),
 ('terms','Terms of use',
  E'DRAFT — replace this text with your own terms.\n\nBy using this app you agree to use it respectfully and only for team purposes. The team may remove accounts or content that break these rules.',2);

-- ═════════ PERMISSIONS & NAV ═════════
insert into permissions(key, description) values
  ('events.manage','Manage the calendar'),('awards.manage','Manage awards'),
  ('pages.manage','Edit info and legal pages'),('audit.view','View the audit log');
insert into role_permissions select r.id, p.key from roles r join permissions p on p.key in ('events.manage','awards.manage','pages.manage','audit.view') where r.name = 'Admin';
insert into role_permissions select r.id, p.key from roles r join permissions p on p.key in ('events.manage','awards.manage') where r.name = 'Manager';
insert into role_permissions select r.id, 'events.manage' from roles r where r.name = 'Coach';

insert into nav_items(label, route, sort_order) values ('Calendar','/calendar',6), ('Awards','/awards',9);
update nav_items set sort_order = case label
  when 'Home' then 1 when 'Matches' then 2 when 'Table' then 3 when 'News' then 4 when 'Players' then 5
  when 'Calendar' then 6 when 'Statistics' then 7 when 'Media' then 8 when 'Awards' then 9 else sort_order end;
