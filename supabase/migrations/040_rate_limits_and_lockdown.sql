-- Phase 40: rate limits for public sign-up endpoints, CAPTCHA site-key setting, and lock the team-code checker.
-- Safe to run more than once.

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table rate_limits enable row level security;   -- no policies on purpose: only the server functions (service role) use it

-- Counts one attempt for a key. Returns true while the person is under the limit for the window, false once they go over.
create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare h int;
begin
  if length(coalesce(p_key, '')) not between 1 and 200 then return true; end if;
  insert into rate_limits(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.hits + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning hits into h;
  if random() < 0.02 then delete from rate_limits where window_start < now() - interval '2 days'; end if;   -- tidy up old rows now and then
  return h <= p_limit;
end $$;
revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;

-- The public Cloudflare Turnstile "site key" (safe to be public). Set it in Admin or with the one-line update shown in the instructions.
insert into site_settings(key, value) values ('turnstile_site_key', '""') on conflict (key) do nothing;

-- check_signup tells you whether a team code / email is valid. Anyone could call it directly and guess codes without limit.
-- The signup function (service role) is now the only caller; the sign-up form no longer calls it directly.
revoke all on function check_signup(text, text) from public, anon, authenticated;
grant execute on function check_signup(text, text) to service_role;
