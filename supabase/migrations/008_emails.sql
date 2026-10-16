-- Super Strikers — Phase 8: customizable emails (auto + manual)

alter table profiles add column email_opt_out boolean not null default false;   -- opts out of bulk team emails only

create table email_settings (
  id int primary key default 1 check (id = 1),
  emails_enabled boolean not null default true,
  theme jsonb not null default '{}'
);
insert into email_settings(id, theme) values (1, '{
  "from_name":"","from_address":"","reply_to":"","logo_url":"","google_font":"",
  "font_family":"Arial, Helvetica, sans-serif","primary_color":"#0B6E4F","background_color":"#F4F5F7",
  "card_color":"#FFFFFF","text_color":"#222222","button_text_color":"#FFFFFF","footer_text":"","radius":12}');

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  event_key text unique not null,
  label text not null,
  enabled boolean not null default true,
  subject text not null,
  body text not null,
  button_label text,
  button_url text,
  variables text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table email_queue (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  to_email text not null,
  to_name text,
  user_id uuid,
  vars jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_queue_status_idx on email_queue(status, created_at desc);

create table email_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  template_key text,
  to_email text not null,
  to_name text,
  subject text,
  status text not null check (status in ('sent','failed')),
  error text,
  kind text not null default 'auto' check (kind in ('auto','auth','manual','bulk','test')),
  sent_by uuid references profiles(id) on delete set null
);
create index email_log_at_idx on email_log(at desc);

alter table email_settings enable row level security;
alter table email_templates enable row level security;
alter table email_queue enable row level security;
alter table email_log enable row level security;
create policy "manage" on email_settings for all using (has_permission('emails.manage'));
create policy "manage" on email_templates for all using (has_permission('emails.manage'));
create policy "read" on email_queue for select using (has_permission('emails.manage'));
create policy "read" on email_log for select using (has_permission('emails.manage'));

insert into permissions(key, description) values ('emails.manage','Edit email design/templates and send emails');
insert into role_permissions select r.id, 'emails.manage' from roles r where r.name in ('Admin','Manager');

-- ───────── Queue helper (internal) ─────────
create or replace function enqueue_email(p_key text, p_to text, p_name text, p_vars jsonb default '{}', p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare tpl email_templates; on_ boolean; team text; url text; nm text; fn text;
begin
  select emails_enabled into on_ from email_settings where id = 1;
  if coalesce(on_, true) = false or p_to is null or p_to = '' then return; end if;
  select * into tpl from email_templates where event_key = p_key and enabled;
  if not found then return; end if;
  select value #>> '{}' into team from site_settings where key = 'team_name';
  select value #>> '{}' into url from site_settings where key = 'site_url';
  nm := nullif(trim(coalesce(p_name,'')), '');
  fn := split_part(coalesce(nm,''), ' ', 1);
  insert into email_queue(template_key, to_email, to_name, user_id, vars)
  values (p_key, lower(p_to), nm, p_user,
    jsonb_build_object('team', coalesce(team,''), 'app_url', coalesce(url,''), 'name', coalesce(nm,'there'),
                       'first_name', coalesce(nullif(fn,''),'there'), 'email', lower(p_to)) || coalesce(p_vars,'{}'));
end $$;
revoke execute on function enqueue_email(text,text,text,jsonb,uuid) from public, anon, authenticated;

-- ───────── Automatic triggers ─────────
-- Welcome email once an account's email is confirmed (or immediately when confirmation is off)
create or replace function email_on_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform enqueue_email('welcome', new.email, new.raw_user_meta_data->>'full_name', '{}', new.id);
  end if;
  return null;
end $$;
create trigger email_user_ins after insert on auth.users for each row execute function email_on_user();
create trigger email_user_upd after update of email_confirmed_at on auth.users for each row execute function email_on_user();

-- Tryout application received / shortlisted / declined
create or replace function email_on_tryout_app() returns trigger language plpgsql security definer set search_path = public as $$
declare t tryouts; tz text; vars jsonb;
begin
  select * into t from tryouts where id = new.tryout_id;
  select value #>> '{}' into tz from site_settings where key = 'timezone'; tz := coalesce(tz, 'UTC');
  vars := jsonb_build_object('tryout_title', t.title, 'tryout_location', coalesce(t.location,''),
            'tryout_date', to_char(t.starts_at at time zone tz, 'FMDay FMDD FMMonth YYYY, HH24:MI'));
  if tg_op = 'INSERT' then
    perform enqueue_email('tryout_received', new.applicant_email, new.applicant_name, vars);
  elsif new.status is distinct from old.status then
    if new.status = 'shortlisted' then perform enqueue_email('tryout_shortlisted', new.applicant_email, new.applicant_name, vars);
    elsif new.status = 'declined' then perform enqueue_email('tryout_declined', new.applicant_email, new.applicant_name, vars); end if;
  end if;
  return null;
end $$;
create trigger email_tryout_app after insert or update of status on tryout_applications for each row execute function email_on_tryout_app();

-- Team code issued to a specific email
create or replace function email_on_team_code() returns trigger language plpgsql security definer set search_path = public as $$
declare nm text; tz text;
begin
  if new.email is null or not new.assign_role then return null; end if;
  select value #>> '{}' into tz from site_settings where key = 'timezone'; tz := coalesce(tz, 'UTC');
  select applicant_name into nm from tryout_applications where id = new.tryout_application_id;
  perform enqueue_email('team_code', new.email, nm, jsonb_build_object('code', new.code,
    'expires_on', case when new.expires_at is null then 'no expiry' else to_char(new.expires_at at time zone tz, 'FMDD FMMonth YYYY') end));
  return null;
end $$;
create trigger email_team_code after insert on team_codes for each row execute function email_on_team_code();

-- Player registration approved / rejected
create or replace function email_on_registration() returns trigger language plpgsql security definer set search_path = public as $$
declare em text; nm text;
begin
  if new.status is not distinct from old.status then return null; end if;
  select email, full_name into em, nm from profiles where id = new.user_id;
  if new.status = 'approved' then perform enqueue_email('registration_approved', em, nm, jsonb_build_object('note', coalesce(new.review_note,'')), new.user_id);
  elsif new.status = 'rejected' then perform enqueue_email('registration_rejected', em, nm, jsonb_build_object('note', coalesce(new.review_note,'')), new.user_id); end if;
  return null;
end $$;
create trigger email_registration after update of status on registrations for each row execute function email_on_registration();

-- ───────── Default templates (all editable in Admin) ─────────
insert into email_templates(event_key, label, subject, body, button_label, button_url, variables, is_system) values
('welcome','Welcome (new account)','Welcome to {team}, {first_name}!',
 E'Hi {first_name},\n\nYour {team} account is ready. Sign in to see fixtures, results, news and team updates.\n\nSee you at the next match!',
 'Open the app','{app_url}','{first_name} {name} {email} {team} {app_url}',true),
('email_confirm','Confirm email (sent at sign-up)','Confirm your email address',
 E'Hi {first_name},\n\nThanks for signing up to {team}. Please confirm your email address to finish creating your account.',
 'Confirm email','{action_url}','{first_name} {name} {email} {team} {action_url}',true),
('password_reset','Password reset','Reset your {team} password',
 E'Hi {first_name},\n\nWe received a request to reset your password. Tap the button below to choose a new one.\n\nIf you didn''t ask for this, you can safely ignore this email — your password will not change.',
 'Reset password','{action_url}','{first_name} {name} {email} {team} {action_url}',true),
('password_changed','Password changed notice','Your password was changed',
 E'Hi {first_name},\n\nThe password for your {team} account was just changed. If this was you, there is nothing more to do.\n\nIf it wasn''t you, contact the team straight away.',
 null,null,'{first_name} {name} {email} {team}',true),
('magic_link','Magic sign-in link','Your {team} sign-in link',
 E'Hi {first_name},\n\nTap the button below to sign in. The link works once and expires soon.',
 'Sign in','{action_url}','{first_name} {name} {email} {team} {action_url}',true),
('invite','Invitation','You''re invited to {team}',
 E'Hi {first_name},\n\nYou''ve been invited to join {team}. Tap the button below to accept and set up your account.',
 'Accept invitation','{action_url}','{first_name} {name} {email} {team} {action_url}',true),
('tryout_received','Tryout application received','We received your tryout application',
 E'Hi {first_name},\n\nThanks for applying for **{tryout_title}**.\n\nWhen: {tryout_date}\nWhere: {tryout_location}\n\nThe coaches will review your application and be in touch.',
 null,null,'{first_name} {name} {email} {team} {tryout_title} {tryout_date} {tryout_location}',true),
('tryout_shortlisted','Tryout: shortlisted','You''ve been shortlisted for {tryout_title}',
 E'Hi {first_name},\n\nGood news — you''ve been shortlisted for **{tryout_title}**.\n\nWhen: {tryout_date}\nWhere: {tryout_location}\n\nWe''ll be in touch with the next steps.',
 null,null,'{first_name} {name} {email} {team} {tryout_title} {tryout_date} {tryout_location}',true),
('tryout_declined','Tryout: not selected','About your tryout application',
 E'Hi {first_name},\n\nThank you for applying for {tryout_title}. We''re sorry to say we can''t offer you a place this time.\n\nWe really appreciate your interest in {team} and hope you''ll try again in future.',
 null,null,'{first_name} {name} {email} {team} {tryout_title}',true),
('team_code','Team code issued','Your {team} team code',
 E'Hi {first_name},\n\nCongratulations — you''ve been selected! Create your player account in the app using this email address and your one-time team code:\n\n**{code}**\n\nThe code works once. Valid until: {expires_on}.',
 'Create my account','{app_url}','{first_name} {name} {email} {team} {code} {expires_on} {app_url}',true),
('registration_approved','Player registration approved','You''re in, {first_name}!',
 E'Hi {first_name},\n\nYour player registration with {team} has been approved. Welcome to the squad!\n\n{note}',
 'Open the app','{app_url}','{first_name} {name} {email} {team} {note} {app_url}',true),
('registration_rejected','Player registration not approved','About your registration',
 E'Hi {first_name},\n\nThank you for registering with {team}. Unfortunately we couldn''t approve it this time.\n\n{note}',
 null,null,'{first_name} {name} {email} {team} {note}',true),
('announcement','Announcement (for manual sending)','News from {team}',
 E'Hi {first_name},\n\nWrite your announcement here.\n\nThanks,\n{team}',
 'Open the app','{app_url}','{first_name} {name} {email} {team} {app_url}',true);
