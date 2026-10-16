-- Super Strikers — Phase 16: Team assistant (chat) — usage counts for fair use + default settings
-- Safe to run more than once.
create table if not exists assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  ip_hash text,                                   -- one-way hash, only for visitors who are not signed in
  created_at timestamptz not null default now()
);
create index if not exists assistant_usage_user_idx on assistant_usage (user_id, created_at desc);
create index if not exists assistant_usage_ip_idx on assistant_usage (ip_hash, created_at desc);
alter table assistant_usage enable row level security;   -- no policies: only the assistant function (service role) touches it

-- Remove counts older than 2 days whenever new ones arrive (keeps the table tiny; question text is never stored)
create or replace function assistant_usage_trim() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from assistant_usage where created_at < now() - interval '2 days'; return null; end $$;
drop trigger if exists assistant_usage_trim_t on assistant_usage;
create trigger assistant_usage_trim_t after insert on assistant_usage for each statement execute function assistant_usage_trim();

insert into site_settings(key, value) values
  ('assistant_enabled', 'true'), ('assistant_guests', 'true'), ('assistant_name', '"Team Assistant"'),
  ('assistant_welcome', '"Hi! I can answer questions about our matches, training, tryouts, news, the shop and how to use this app. What would you like to know?"'),
  ('assistant_notes', '""'), ('assistant_timezone', '"UTC"'), ('assistant_hourly_limit', '40'),
  ('assistant_questions', '["When is our next match?","What was the last result?","Do we have any friendly matches coming up?","When is the next training?","What offers are on in the shop?","How do I use the spin wheel?"]')
on conflict do nothing;
