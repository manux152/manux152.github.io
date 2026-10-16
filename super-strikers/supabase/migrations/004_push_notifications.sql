-- Super Strikers — Phase 4: push notifications (queue-based, admin-configurable rules)

alter table profiles add column push_enabled boolean not null default true;

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text unique not null,
  platform text,
  created_at timestamptz not null default now()
);

create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  event_key text unique not null,      -- 'news_published', 'match_result'
  label text not null,
  enabled boolean not null default true,
  title_template text not null,
  body_template text not null default ''
);

create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',            -- e.g. {"route":"/news/my-post"}
  audience_role_ids uuid[],                    -- null = everyone who has push enabled
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  sent_count int not null default 0,
  error text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create or replace function render_template(t text, vars jsonb) returns text
language plpgsql immutable as $$
declare k text; v text; out text := coalesce(t,'');
begin
  for k, v in select key, value from jsonb_each_text(vars) loop
    out := replace(out, '{' || k || '}', coalesce(v,''));
  end loop;
  return out;
end $$;

-- Rule: news published
create or replace function queue_news_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare rule notification_rules; team text; vars jsonb;
begin
  if new.published_at is null or new.published_at > now() then return null; end if;
  if tg_op = 'UPDATE' and old.published_at is not null and old.published_at <= now() then return null; end if;
  select * into rule from notification_rules where event_key = 'news_published' and enabled;
  if not found then return null; end if;
  select value #>> '{}' into team from site_settings where key = 'team_name';
  vars := jsonb_build_object('title', new.title, 'summary', coalesce(new.summary,''), 'team', coalesce(team,''));
  insert into notification_queue(title, body, data)
  values (render_template(rule.title_template, vars), render_template(rule.body_template, vars),
          jsonb_build_object('route', '/news/' || new.slug));
  return null;
end $$;
create trigger news_push after insert or update of published_at on news_posts
  for each row execute function queue_news_push();

-- Rule: match finished
create or replace function queue_match_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare rule notification_rules; team text; opp text; vars jsonb;
begin
  if new.status <> 'finished' or old.status = 'finished' then return null; end if;
  select * into rule from notification_rules where event_key = 'match_result' and enabled;
  if not found then return null; end if;
  select value #>> '{}' into team from site_settings where key = 'team_name';
  select name into opp from opponents where id = new.opponent_id;
  vars := jsonb_build_object('team', coalesce(team,''), 'opponent', coalesce(opp,''),
            'goals_for', coalesce(new.goals_for,0), 'goals_against', coalesce(new.goals_against,0));
  insert into notification_queue(title, body, data)
  values (render_template(rule.title_template, vars), render_template(rule.body_template, vars),
          jsonb_build_object('route', '/match/' || new.id));
  return null;
end $$;
create trigger match_push after update of status on matches
  for each row execute function queue_match_push();

-- Seeds
insert into permissions(key, description) values ('notifications.manage','Send notifications and edit notification rules');
insert into role_permissions select r.id,'notifications.manage' from roles r where r.name in ('Admin','Manager');

insert into notification_rules(event_key, label, title_template, body_template) values
  ('news_published','New news post','📰 {title}','{summary}'),
  ('match_result','Match finished','Full time: {team} {goals_for}–{goals_against} {opponent}','Tap for the match details');

-- RLS
alter table push_tokens enable row level security;
alter table notification_rules enable row level security;
alter table notification_queue enable row level security;

create policy "own tokens" on push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "manage" on notification_rules for all using (has_permission('notifications.manage'));
create policy "manage" on notification_queue for all using (has_permission('notifications.manage'));
