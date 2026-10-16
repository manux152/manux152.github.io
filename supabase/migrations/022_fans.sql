-- Super Strikers — Phase 22: fans (polls, news comments with moderation, "Predict the score" league, referral rewards)
-- Safe to run more than once.
--
-- PRIVACY: people appear on comments and leaderboards as first name + last initial (e.g. "Sam K.") with their profile photo.
-- Members can switch themselves off leaderboards (profiles.show_on_leaderboards). Votes and predictions are never shown per person.

-- ═════════ Settings ═════════
insert into site_settings(key, value) values
  ('comments_mode', '"open"'),              -- "open" | "approval" (staff approve each comment first) | "off"
  ('polls_enabled', 'true'),
  ('fan_predictions_enabled', 'true'),
  ('referral_enabled', 'true'),
  ('referral_reward_kind', '"percent"'),    -- "percent" | "fixed" | "free_delivery"
  ('referral_reward_value', '10'),
  ('referral_min_order', '0'),              -- the friend's order must be at least this much to count (and the reward code needs the same minimum)
  ('referral_expires_days', '60'),          -- how long the reward code lasts
  ('referral_window_days', '60'),           -- the friend has this long after joining to place a paid order
  ('referral_max_rewards', '5')             -- most rewards one member can earn
on conflict do nothing;

create or replace function fan_flag(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when value = 'true'::jsonb or value #>> '{}' = 'true' then true
                               when value = 'false'::jsonb or value #>> '{}' = 'false' then false end
                   from site_settings where key = p_key), p_default);
$$;
create or replace function fan_setting(p_key text, p_default text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value #>> '{}' from site_settings where key = p_key), p_default);
$$;

-- Moderators
insert into permissions(key, description) values ('comments.moderate', 'Approve, hide and remove news comments, and stop people from commenting')
on conflict do nothing;
insert into role_permissions(role_id, permission_key)
select id, 'comments.moderate' from roles where lower(name) in ('admin', 'super admin', 'super_admin', 'superadmin', 'manager')
on conflict do nothing;

-- ═════════ Names that are safe to show ═════════
alter table profiles add column if not exists show_on_leaderboards boolean not null default true;

create or replace function fan_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when nullif(trim(full_name), '') is null then 'Member'
    when position(' ' in trim(full_name)) = 0 then trim(full_name)
    else split_part(trim(full_name), ' ', 1) || ' ' || upper(left(regexp_replace(trim(full_name), '^.*\s', ''), 1)) || '.'
  end from profiles where id = p_user;
$$;

-- ═════════ POLLS ═════════
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(question) between 3 and 200),
  match_id uuid references matches(id) on delete set null,        -- shown on that match's page
  news_id uuid references news_posts(id) on delete cascade,       -- shown under that story
  results_mode text not null default 'after_vote' check (results_mode in ('always', 'after_vote', 'after_close')),
  closes_at timestamptz,
  is_published boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table polls add column if not exists id uuid default gen_random_uuid();
alter table polls add column if not exists question text check (length(question) between 3 and 200);
alter table polls add column if not exists match_id uuid references matches(id) on delete set null;
alter table polls add column if not exists news_id uuid references news_posts(id) on delete cascade;
alter table polls add column if not exists results_mode text not null default 'after_vote' check (results_mode in ('always', 'after_vote', 'after_close'));
alter table polls add column if not exists closes_at timestamptz;
alter table polls add column if not exists is_published boolean not null default true;
alter table polls add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table polls add column if not exists created_at timestamptz not null default now();
create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  label text not null check (length(label) between 1 and 80),
  sort_order int not null default 0
);
-- Older version of this table already there? Add any columns it is missing.
alter table poll_options add column if not exists id uuid default gen_random_uuid();
alter table poll_options add column if not exists poll_id uuid references polls(id) on delete cascade;
alter table poll_options add column if not exists label text check (length(label) between 1 and 80);
alter table poll_options add column if not exists sort_order int not null default 0;
create index if not exists poll_options_poll_idx on poll_options (poll_id, sort_order);
create table if not exists poll_votes (
  poll_id uuid not null references polls(id) on delete cascade,
  voter_id uuid not null references profiles(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, voter_id)
);
-- Older version of this table already there? Add any columns it is missing.
alter table poll_votes add column if not exists poll_id uuid references polls(id) on delete cascade;
alter table poll_votes add column if not exists voter_id uuid references profiles(id) on delete cascade;
alter table poll_votes add column if not exists option_id uuid references poll_options(id) on delete cascade;
alter table poll_votes add column if not exists created_at timestamptz not null default now();

create or replace function poll_is_open(p_poll uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select fan_flag('polls_enabled', true) and exists (select 1 from polls p where p.id = p_poll and p.is_published and (p.closes_at is null or p.closes_at > now()));
$$;

alter table polls enable row level security;
alter table poll_options enable row level security;
alter table poll_votes enable row level security;
drop policy if exists "read" on polls;       drop policy if exists "manage" on polls;
drop policy if exists "read" on poll_options; drop policy if exists "manage" on poll_options;
drop policy if exists "own read" on poll_votes; drop policy if exists "own vote" on poll_votes; drop policy if exists "own change" on poll_votes;
create policy "read" on polls for select using ((is_published and fan_flag('polls_enabled', true)) or has_permission('news.manage'));
create policy "manage" on polls for all using (has_permission('news.manage')) with check (has_permission('news.manage'));
create policy "read" on poll_options for select using (exists (select 1 from polls p where p.id = poll_id and ((p.is_published and fan_flag('polls_enabled', true)) or has_permission('news.manage'))));
create policy "manage" on poll_options for all using (has_permission('news.manage')) with check (has_permission('news.manage'));
create policy "own read" on poll_votes for select to authenticated using (voter_id = auth.uid());
create policy "own vote" on poll_votes for insert to authenticated with check (
  voter_id = auth.uid() and poll_is_open(poll_id) and exists (select 1 from poll_options o where o.id = option_id and o.poll_id = poll_votes.poll_id));
create policy "own change" on poll_votes for update to authenticated using (voter_id = auth.uid()) with check (
  voter_id = auth.uid() and poll_is_open(poll_id) and exists (select 1 from poll_options o where o.id = option_id and o.poll_id = poll_votes.poll_id));

-- Totals respect the poll's results setting. Nobody can see who voted for what.
create or replace function poll_results(p_poll uuid) returns table (option_id uuid, votes bigint)
language sql stable security definer set search_path = public as $$
  select o.id, count(v.voter_id)
  from poll_options o join polls p on p.id = o.poll_id
  left join poll_votes v on v.option_id = o.id
  where o.poll_id = p_poll and p.is_published
    and (p.results_mode = 'always'
         or (p.results_mode = 'after_vote' and (exists (select 1 from poll_votes me where me.poll_id = p_poll and me.voter_id = auth.uid()) or not poll_is_open(p_poll)))
         or (p.results_mode = 'after_close' and not poll_is_open(p_poll))
         or has_permission('news.manage'))
  group by o.id, o.sort_order order by o.sort_order;
$$;
grant execute on function poll_results(uuid) to anon, authenticated;

-- ═════════ NEWS COMMENTS ═════════
alter table news_posts add column if not exists comments_enabled boolean not null default true;

create table if not exists news_comments (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references news_posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null check (length(body) between 1 and 500),
  status text not null default 'visible' check (status in ('visible', 'pending', 'hidden')),
  moderated_by uuid references profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table news_comments add column if not exists id uuid default gen_random_uuid();
alter table news_comments add column if not exists news_id uuid references news_posts(id) on delete cascade;
alter table news_comments add column if not exists author_id uuid references profiles(id) on delete set null;
alter table news_comments add column if not exists body text check (length(body) between 1 and 500);
alter table news_comments add column if not exists status text not null default 'visible' check (status in ('visible', 'pending', 'hidden'));
alter table news_comments add column if not exists moderated_by uuid references profiles(id) on delete set null;
alter table news_comments add column if not exists moderated_at timestamptz;
alter table news_comments add column if not exists created_at timestamptz not null default now();
create index if not exists news_comments_news_idx on news_comments (news_id, created_at);
create index if not exists news_comments_author_idx on news_comments (author_id, created_at desc);

create table if not exists comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references news_comments(id) on delete cascade,
  reporter uuid references profiles(id) on delete set null,
  reason text check (reason is null or length(reason) <= 300),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter)
);
-- Older version of this table already there? Add any columns it is missing.
alter table comment_reports add column if not exists id uuid default gen_random_uuid();
alter table comment_reports add column if not exists comment_id uuid references news_comments(id) on delete cascade;
alter table comment_reports add column if not exists reporter uuid references profiles(id) on delete set null;
alter table comment_reports add column if not exists reason text check (reason is null or length(reason) <= 300);
alter table comment_reports add column if not exists status text not null default 'open' check (status in ('open', 'dismissed', 'actioned'));
alter table comment_reports add column if not exists created_at timestamptz not null default now();
create table if not exists comment_bans (
  user_id uuid primary key references profiles(id) on delete cascade,
  reason text,
  banned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table comment_bans add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table comment_bans add column if not exists reason text;
alter table comment_bans add column if not exists banned_by uuid references profiles(id) on delete set null;
alter table comment_bans add column if not exists created_at timestamptz not null default now();

alter table news_comments enable row level security;
alter table comment_reports enable row level security;
alter table comment_bans enable row level security;
drop policy if exists "moderators" on news_comments;
drop policy if exists "moderators" on comment_reports;
drop policy if exists "moderators" on comment_bans;
-- No public or member access to the table itself: reading and writing go through the functions below.
create policy "moderators" on news_comments for all to authenticated using (has_permission('comments.moderate')) with check (has_permission('comments.moderate'));
create policy "moderators" on comment_reports for all to authenticated using (has_permission('comments.moderate')) with check (has_permission('comments.moderate'));
create policy "moderators" on comment_bans for all to authenticated using (has_permission('comments.moderate')) with check (has_permission('comments.moderate'));

create or replace function comments_open_for(p_news uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select fan_setting('comments_mode', 'open') <> 'off'
     and exists (select 1 from news_posts n where n.id = p_news and n.published_at is not null and n.published_at <= now() and n.comments_enabled);
$$;
grant execute on function comments_open_for(uuid) to anon, authenticated;

-- What a story page shows: visible comments, plus your own comments that are waiting for approval.
create or replace function news_comments_for(p_news uuid)
returns table (id uuid, author_id uuid, author_name text, avatar_url text, body text, status text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.author_id, fan_name(c.author_id), pr.avatar_url, c.body, c.status, c.created_at, (c.author_id = auth.uid())
  from news_comments c left join profiles pr on pr.id = c.author_id
  where c.news_id = p_news and comments_open_for(p_news)
    and (c.status = 'visible' or (c.status = 'pending' and c.author_id = auth.uid()))
  order by c.created_at asc limit 200;
$$;
grant execute on function news_comments_for(uuid) to anon, authenticated;

create or replace function comment_post(p_news uuid, p_body text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b text := trim(coalesce(p_body, '')); mode text; st text; mod boolean;
begin
  if uid is null then raise exception 'Please sign in to comment'; end if;
  if not comments_open_for(p_news) then raise exception 'Comments are closed on this story'; end if;
  if exists (select 1 from comment_bans where user_id = uid) then raise exception 'You can no longer comment'; end if;
  if length(b) < 1 then raise exception 'Write something first'; end if;
  if length(b) > 500 then raise exception 'Comments can be up to 500 characters'; end if;
  if b ~* '(https?://|www\.|\.com\b|\.net\b|\.org\b)' then raise exception 'Links are not allowed in comments'; end if;
  if (select count(*) from news_comments where author_id = uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You are commenting very quickly. Please try again later'; end if;
  if exists (select 1 from news_comments where author_id = uid and news_id = p_news and body = b and created_at > now() - interval '1 day') then
    raise exception 'You already posted that'; end if;
  mode := fan_setting('comments_mode', 'open'); mod := has_permission('comments.moderate');
  st := case when mode = 'approval' and not mod then 'pending' else 'visible' end;
  insert into news_comments(news_id, author_id, body, status) values (p_news, uid, b, st);
  return st;
end $$;
revoke all on function comment_post(uuid, text) from public, anon;
grant execute on function comment_post(uuid, text) to authenticated;

create or replace function comment_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c news_comments;
begin
  select * into c from news_comments where id = p_id;
  if not found then return; end if;
  if c.author_id = auth.uid() then delete from news_comments where id = p_id;
  elsif has_permission('comments.moderate') then update news_comments set status = 'hidden', moderated_by = auth.uid(), moderated_at = now() where id = p_id;
  else raise exception 'Not allowed'; end if;
end $$;
revoke all on function comment_delete(uuid) from public, anon;
grant execute on function comment_delete(uuid) to authenticated;

-- Anyone signed in can report. Three different reporters hide a comment until a moderator looks at it.
create or replace function comment_report(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if not exists (select 1 from news_comments where id = p_id and status = 'visible') then return; end if;
  insert into comment_reports(comment_id, reporter, reason) values (p_id, auth.uid(), left(p_reason, 300)) on conflict do nothing;
  select count(*) into n from comment_reports where comment_id = p_id and status = 'open';
  if n >= 3 then update news_comments set status = 'hidden', moderated_at = now() where id = p_id and status = 'visible'; end if;
end $$;
revoke all on function comment_report(uuid, text) from public, anon;
grant execute on function comment_report(uuid, text) to authenticated;

create or replace function comment_moderate(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('comments.moderate') then raise exception 'Not allowed'; end if;
  if p_action in ('approve', 'restore') then
    update news_comments set status = 'visible', moderated_by = auth.uid(), moderated_at = now() where id = p_id;
    update comment_reports set status = 'dismissed' where comment_id = p_id and status = 'open';
  elsif p_action = 'hide' then
    update news_comments set status = 'hidden', moderated_by = auth.uid(), moderated_at = now() where id = p_id;
    update comment_reports set status = 'actioned' where comment_id = p_id and status = 'open';
  elsif p_action = 'delete' then
    delete from news_comments where id = p_id;
  else raise exception 'Unknown action'; end if;
end $$;
revoke all on function comment_moderate(uuid, text) from public, anon;
grant execute on function comment_moderate(uuid, text) to authenticated;

-- ═════════ PREDICT THE SCORE ═════════
create table if not exists fan_predictions (
  match_id uuid not null references matches(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  goals_for int not null check (goals_for between 0 and 20),
  goals_against int not null check (goals_against between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
-- Older version of this table already there? Add any columns it is missing.
alter table fan_predictions add column if not exists match_id uuid references matches(id) on delete cascade;
alter table fan_predictions add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table fan_predictions add column if not exists goals_for int check (goals_for between 0 and 20);
alter table fan_predictions add column if not exists goals_against int check (goals_against between 0 and 20);
alter table fan_predictions add column if not exists created_at timestamptz not null default now();
alter table fan_predictions add column if not exists updated_at timestamptz not null default now();
create index if not exists fan_predictions_user_idx on fan_predictions (user_id);

create or replace function fan_can_predict(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select fan_flag('fan_predictions_enabled', true)
     and exists (select 1 from matches m where m.id = p_match and m.status = 'scheduled' and m.kickoff_at > now());
$$;

create or replace function touch_fan_prediction() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch on fan_predictions;
create trigger touch before update on fan_predictions for each row execute function touch_fan_prediction();

alter table fan_predictions enable row level security;
drop policy if exists "own read" on fan_predictions;
drop policy if exists "own write" on fan_predictions;
drop policy if exists "own change" on fan_predictions;
create policy "own read" on fan_predictions for select to authenticated using (user_id = auth.uid());
create policy "own write" on fan_predictions for insert to authenticated with check (user_id = auth.uid() and fan_can_predict(match_id));
create policy "own change" on fan_predictions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and fan_can_predict(match_id));

-- 5 points for the exact score, 2 for the right result (win / draw / loss)
create or replace function fan_points(pf int, pa int, af int, aa int) returns int
language sql immutable as $$
  select case when pf = af and pa = aa then 5 when sign(pf - pa) = sign(af - aa) then 2 else 0 end;
$$;

create or replace function prediction_leaderboard(p_since timestamptz default null, p_limit int default 50)
returns table (rank bigint, user_id uuid, name text, avatar_url text, points bigint, exact bigint, correct bigint, played bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with s as (
    select fp.user_id, count(*) played,
           sum(fan_points(fp.goals_for, fp.goals_against, m.goals_for, m.goals_against)) points,
           count(*) filter (where fp.goals_for = m.goals_for and fp.goals_against = m.goals_against) exact,
           count(*) filter (where sign(fp.goals_for - fp.goals_against) = sign(m.goals_for - m.goals_against)) correct
    from fan_predictions fp join matches m on m.id = fp.match_id and m.status = 'finished' and m.goals_for is not null and m.goals_against is not null
    where (p_since is null or m.kickoff_at >= p_since)
    group by fp.user_id)
  select rank() over (order by s.points desc, s.exact desc, s.played asc), s.user_id, fan_name(s.user_id), pr.avatar_url, s.points, s.exact, s.correct, s.played, (s.user_id = auth.uid())
  from s join profiles pr on pr.id = s.user_id
  where auth.uid() is not null and (pr.show_on_leaderboards or s.user_id = auth.uid())
  order by 1, s.exact desc, s.played asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke all on function prediction_leaderboard(timestamptz, int) from public, anon;
grant execute on function prediction_leaderboard(timestamptz, int) to authenticated;

-- What other fans are picking. Only shown once there are at least 5 picks, and only to people who have picked or after kick-off.
create or replace function fan_pick_summary(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; w int; d int; l int; af numeric; aa numeric; mine boolean; started boolean;
begin
  select count(*), count(*) filter (where goals_for > goals_against), count(*) filter (where goals_for = goals_against), count(*) filter (where goals_for < goals_against),
         round(avg(goals_for), 1), round(avg(goals_against), 1)
    into n, w, d, l, af, aa from fan_predictions where match_id = p_match;
  select exists (select 1 from fan_predictions where match_id = p_match and user_id = auth.uid()) into mine;
  select not fan_can_predict(p_match) into started;
  if n < 5 or not (mine or started) then return jsonb_build_object('total', n, 'visible', false); end if;
  return jsonb_build_object('total', n, 'visible', true, 'win', w, 'draw', d, 'loss', l, 'avg_for', af, 'avg_against', aa);
end $$;
grant execute on function fan_pick_summary(uuid) to anon, authenticated;

-- ═════════ REFERRALS ═════════
alter table profiles add column if not exists referral_code text;
create unique index if not exists profiles_referral_code_idx on profiles (referral_code);

create or replace function make_referral_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; bytes bytea;
begin
  loop
    bytes := gen_random_bytes(7); c := '';
    for i in 0..6 loop c := c || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from profiles where referral_code = c);
  end loop;
  return c;
end $$;

create or replace function set_referral_code() returns trigger
language plpgsql set search_path = public, extensions as $$
begin if new.referral_code is null then new.referral_code := make_referral_code(); end if; return new; end $$;
drop trigger if exists referral_code_default on profiles;
create trigger referral_code_default before insert on profiles for each row execute function set_referral_code();
update profiles set referral_code = make_referral_code() where referral_code is null;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referee_id uuid not null unique references profiles(id) on delete cascade,        -- a person can only be referred once
  code text not null,
  status text not null default 'joined' check (status in ('joined', 'rewarded', 'rejected', 'capped')),
  reward_promo_id uuid references promotions(id) on delete set null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referrer_id <> referee_id)
);
-- Older version of this table already there? Add any columns it is missing.
alter table referrals add column if not exists id uuid default gen_random_uuid();
alter table referrals add column if not exists referrer_id uuid references profiles(id) on delete cascade;
alter table referrals add column if not exists referee_id uuid references profiles(id) on delete cascade;
alter table referrals add column if not exists code text;
alter table referrals add column if not exists status text not null default 'joined' check (status in ('joined', 'rewarded', 'rejected', 'capped'));
alter table referrals add column if not exists reward_promo_id uuid references promotions(id) on delete set null;
alter table referrals add column if not exists created_at timestamptz not null default now();
alter table referrals add column if not exists rewarded_at timestamptz;
create index if not exists referrals_referrer_idx on referrals (referrer_id, created_at desc);
alter table referrals enable row level security;
drop policy if exists "staff" on referrals;
create policy "staff" on referrals for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

-- Reward codes live with the other personal codes
do $$ begin
  begin alter table promotions drop constraint if exists promotions_source_check; exception when others then null; end;
  begin alter table promotions add constraint promotions_source_check check (source in ('admin', 'spin', 'referral')); exception when duplicate_object then null; end;
end $$;

-- A new account that came with a referral code (typed at sign-up or arrived through a friend's link)
create or replace function capture_referral() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', ''))); r uuid;
begin
  if c = '' or not fan_flag('referral_enabled', true) then return new; end if;
  begin
    select id into r from profiles where referral_code = c and is_active;
    if r is not null and r <> new.id then insert into referrals(referrer_id, referee_id, code) values (r, new.id, c) on conflict do nothing; end if;
  exception when others then null;          -- a referral problem must never stop someone creating an account
  end;
  return new;
end $$;
drop trigger if exists on_auth_user_created_referral on auth.users;
create trigger on_auth_user_created_referral after insert on auth.users for each row execute function capture_referral();

-- For someone who forgot to enter the code: allowed within 14 days of joining, once, before any reward
create or replace function claim_referral(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text := upper(trim(coalesce(p_code, ''))); r uuid; joined timestamptz;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if not fan_flag('referral_enabled', true) then raise exception 'Referrals are switched off'; end if;
  select created_at into joined from profiles where id = uid;
  if joined < now() - interval '14 days' then raise exception 'You can only add a referral code in your first 14 days'; end if;
  if exists (select 1 from referrals where referee_id = uid) then raise exception 'You already have a referral on your account'; end if;
  select id into r from profiles where referral_code = c and is_active;
  if r is null then raise exception 'That referral code was not found'; end if;
  if r = uid then raise exception 'You cannot use your own code'; end if;
  insert into referrals(referrer_id, referee_id, code) values (r, uid, c);
  return fan_name(r);
end $$;
revoke all on function claim_referral(text) from public, anon;
grant execute on function claim_referral(text) to authenticated;

-- The friend's first qualifying PAID order earns the referrer one reward code
create or replace function referral_reward() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare rf referrals; kind text; val numeric; minimum numeric; days int; win int; cap int; done int; code text; pid uuid;
begin
  if new.payment_status <> 'paid' or new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.payment_status = 'paid' then return new; end if;
  if not fan_flag('referral_enabled', true) then return new; end if;
  select * into rf from referrals where referee_id = new.user_id and status = 'joined' for update;
  if not found then return new; end if;
  minimum := coalesce(fan_setting('referral_min_order', '0')::numeric, 0);
  win := coalesce(fan_setting('referral_window_days', '60')::int, 60);
  if new.subtotal < minimum or rf.created_at < now() - make_interval(days => win) then return new; end if;

  cap := coalesce(fan_setting('referral_max_rewards', '5')::int, 5);
  select count(*) into done from referrals where referrer_id = rf.referrer_id and status = 'rewarded';
  if done >= cap then update referrals set status = 'capped' where id = rf.id; return new; end if;

  kind := fan_setting('referral_reward_kind', 'percent'); if kind not in ('percent', 'fixed', 'free_delivery') then kind := 'percent'; end if;
  val := coalesce(fan_setting('referral_reward_value', '10')::numeric, 10); if kind = 'percent' then val := least(val, 100); end if;
  days := coalesce(fan_setting('referral_expires_days', '60')::int, 60);
  code := 'REF-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
  insert into promotions(title, kind, value, min_subtotal, code, user_id, source, ends_at, max_uses, is_active, show_banner)
  values ('Thanks for inviting a friend', kind, case when kind = 'free_delivery' then 0 else val end, minimum, code, rf.referrer_id, 'referral', now() + make_interval(days => days), 1, true, false)
  returning id into pid;
  update referrals set status = 'rewarded', reward_promo_id = pid, rewarded_at = now() where id = rf.id;
  return new;
end $$;
drop trigger if exists referral_reward_trg on orders;
create trigger referral_reward_trg after insert or update of payment_status on orders for each row execute function referral_reward();

-- The member's own "Invite friends" page
create or replace function my_referrals() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return null; end if;
  return jsonb_build_object(
    'enabled', fan_flag('referral_enabled', true),
    'code', (select referral_code from profiles where id = uid),
    'reward_kind', fan_setting('referral_reward_kind', 'percent'), 'reward_value', fan_setting('referral_reward_value', '10'),
    'min_order', fan_setting('referral_min_order', '0'), 'max_rewards', fan_setting('referral_max_rewards', '5'),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('name', fan_name(referee_id), 'status', status, 'joined', created_at) order by created_at desc) from referrals where referrer_id = uid), '[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'value', p.value, 'min_subtotal', p.min_subtotal, 'ends_at', p.ends_at, 'used', p.uses >= coalesce(p.max_uses, 1)) order by p.created_at desc)
                         from promotions p where p.user_id = uid and p.source = 'referral'), '[]'::jsonb),
    'was_referred', exists (select 1 from referrals where referee_id = uid));
end $$;
revoke all on function my_referrals() from public, anon;
grant execute on function my_referrals() to authenticated;

-- ═════════ Staff screens ═════════
-- Moderation queue for Admin → Comments (names are the same safe form fans see)
create or replace function comment_queue(p_kind text default 'pending')
returns table (id uuid, news_id uuid, news_title text, author_id uuid, author_name text, body text, status text, created_at timestamptz, reports bigint, banned boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('comments.moderate') then raise exception 'Not allowed'; end if;
  return query
    select c.id, c.news_id, n.title, c.author_id, fan_name(c.author_id), c.body, c.status, c.created_at,
           (select count(*) from comment_reports r where r.comment_id = c.id and r.status = 'open'),
           exists (select 1 from comment_bans b where b.user_id = c.author_id)
    from news_comments c join news_posts n on n.id = c.news_id
    where case p_kind when 'pending' then c.status = 'pending'
                      when 'reported' then exists (select 1 from comment_reports r where r.comment_id = c.id and r.status = 'open')
                      when 'hidden' then c.status = 'hidden'
                      else true end
    order by c.created_at desc limit 60;
end $$;
revoke all on function comment_queue(text) from public, anon;
grant execute on function comment_queue(text) to authenticated;

-- Admin → Referrals list
create or replace function referrals_admin()
returns table (id uuid, referrer text, referee text, status text, created_at timestamptz, rewarded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('settings.manage') then raise exception 'Not allowed'; end if;
  return query select r.id, fan_name(r.referrer_id), fan_name(r.referee_id), r.status, r.created_at, r.rewarded_at from referrals r order by r.created_at desc limit 100;
end $$;
revoke all on function referrals_admin() from public, anon;
grant execute on function referrals_admin() to authenticated;

-- ═════════ Keep referral fields out of members' hands ═════════
-- Members edit their own profile, but must not change their referral code or their join date (the 14-day "add a code" window uses it).
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not has_permission('users.manage') then
    new.id := old.id; new.email := old.email; new.is_active := old.is_active;
    new.referral_code := old.referral_code; new.created_at := old.created_at;
  end if;
  return new;
end $$;
