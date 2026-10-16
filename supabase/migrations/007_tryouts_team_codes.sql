-- Super Strikers — Phase 7: tryouts + restricted sign-up (team email domain + single-use team code)

-- ═════════ TEAM CODES ═════════
create table team_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  role_id uuid references roles(id) on delete set null,   -- null = the 'registration_role' setting (default Player)
  assign_role boolean not null default true,
  email text,                                             -- if set, only this email can use the code
  bypass_domain boolean not null default false,           -- true = any email address allowed
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null,
  note text,
  tryout_application_id uuid,                             -- FK added below
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index team_codes_created_idx on team_codes(created_at desc);
alter table team_codes enable row level security;
create policy "manage" on team_codes for all using (has_permission('codes.manage'));

-- ═════════ TRYOUTS ═════════
create table tryouts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  age_group text,
  capacity int,
  applications_open boolean not null default true,
  apply_by timestamptz,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create table tryout_fields (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  type text not null default 'text' check (type in ('text','longtext','number','date','select')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true
);
create table tryout_applications (
  id uuid primary key default gen_random_uuid(),
  tryout_id uuid not null references tryouts(id) on delete cascade,
  applicant_name text not null check (char_length(applicant_name) between 1 and 120),
  applicant_email text not null check (applicant_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(applicant_email) <= 200),
  answers jsonb not null default '{}' check (pg_column_size(answers) < 6000),
  status text not null default 'applied' check (status in ('applied','shortlisted','accepted','declined','joined')),
  admin_note text,
  created_at timestamptz not null default now()
);
create unique index tryout_apps_unique on tryout_applications(tryout_id, lower(applicant_email));
alter table team_codes add constraint team_codes_application_fk
  foreign key (tryout_application_id) references tryout_applications(id) on delete set null;

alter table tryouts enable row level security;
alter table tryout_fields enable row level security;
alter table tryout_applications enable row level security;
create policy "public read" on tryouts for select using (is_published or has_permission('tryouts.manage'));
create policy "manage" on tryouts for all using (has_permission('tryouts.manage'));
create policy "public read" on tryout_fields for select using (is_active or has_permission('tryouts.manage'));
create policy "manage" on tryout_fields for all using (has_permission('tryouts.manage'));
-- Anyone may apply to an open tryout; only staff can read applications
create policy "apply" on tryout_applications for insert to anon, authenticated with check (
  status = 'applied' and admin_note is null and exists (
    select 1 from tryouts t where t.id = tryout_id and t.is_published and t.applications_open
      and (t.apply_by is null or t.apply_by > now())));
create policy "manage" on tryout_applications for all using (has_permission('tryouts.manage'));

-- ═════════ SIGN-UP RULES ═════════
-- Blocks sign-ups (any method) unless the email domain is allowed and a valid unused team code is supplied.
-- The very first account (the owner) is exempt and becomes Admin.
create or replace function enforce_signup_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare req boolean; domains jsonb; dom text; c team_codes; em text := lower(coalesce(new.email,''));
begin
  if not exists (select 1 from profiles) then return new; end if;
  select coalesce((value #>> '{}')::boolean, true) into req from site_settings where key = 'signup_requires_code';
  if not coalesce(req, true) then return new; end if;
  update team_codes set used_at = now()
   where code = upper(trim(coalesce(new.raw_user_meta_data->>'team_code','')))
     and used_at is null and (expires_at is null or expires_at > now())
     and (email is null or lower(email) = em)
  returning * into c;
  if not found then raise exception 'Invalid, used or expired team code'; end if;
  select value into domains from site_settings where key = 'allowed_email_domains';
  if not c.bypass_domain and domains is not null and jsonb_typeof(domains) = 'array' and jsonb_array_length(domains) > 0 then
    dom := split_part(em, '@', 2);
    if not exists (select 1 from jsonb_array_elements_text(domains) d where lower(trim(d)) = dom) then
      raise exception 'Email domain not allowed';
    end if;
  end if;
  return new;
end $$;
create trigger enforce_signup before insert on auth.users for each row execute function enforce_signup_rules();

-- After the account exists: attach the code, assign the role, link the tryout application
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean; c team_codes; rid uuid; role_name text; got boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles(id, email, full_name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''));
  if first_user then
    insert into user_roles(user_id, role_id) select new.id, id from roles where name = 'Admin' on conflict do nothing;
    return new;
  end if;
  update team_codes set used_by = new.id
   where code = upper(trim(coalesce(new.raw_user_meta_data->>'team_code','')))
     and used_at is not null and used_by is null
  returning * into c;
  got := found;
  if got and c.assign_role then
    rid := c.role_id;
    if rid is null then
      select value #>> '{}' into role_name from site_settings where key = 'registration_role';
      select id into rid from roles where name = coalesce(role_name, 'Player');
    end if;
    if rid is not null then insert into user_roles(user_id, role_id) values (new.id, rid) on conflict do nothing; end if;
  end if;
  if got and c.tryout_application_id is not null then
    update tryout_applications set status = 'joined' where id = c.tryout_application_id;
  end if;
  return new;
end $$;

-- Friendly pre-check for the sign-up screen (does not consume the code)
create or replace function check_signup(p_email text, p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare req boolean; domains jsonb; c team_codes; em text := lower(coalesce(p_email,''));
begin
  if not exists (select 1 from profiles) then return 'ok'; end if;
  select coalesce((value #>> '{}')::boolean, true) into req from site_settings where key = 'signup_requires_code';
  if not coalesce(req, true) then return 'ok'; end if;
  select * into c from team_codes where code = upper(trim(coalesce(p_code,'')))
     and used_at is null and (expires_at is null or expires_at > now()) and (email is null or lower(email) = em);
  if not found then return 'code'; end if;
  select value into domains from site_settings where key = 'allowed_email_domains';
  if not c.bypass_domain and domains is not null and jsonb_typeof(domains) = 'array' and jsonb_array_length(domains) > 0
     and not exists (select 1 from jsonb_array_elements_text(domains) d where lower(trim(d)) = split_part(em,'@',2)) then
    return 'domain';
  end if;
  return 'ok';
end $$;

-- Admin: generate single-use codes
create or replace function generate_team_codes(
  n int default 1, p_role_id uuid default null, p_email text default null, p_expires_days int default 30,
  p_bypass_domain boolean default false, p_note text default null, p_application uuid default null)
returns setof team_codes language plpgsql security definer set search_path = public, extensions as $$
declare alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; pref text; i int; j int; code text; bytes bytea; r team_codes;
begin
  if not has_permission('codes.manage') then raise exception 'Forbidden'; end if;
  if n < 1 or n > 100 then raise exception 'Choose between 1 and 100 codes'; end if;
  select coalesce(value #>> '{}', 'TEAM') into pref from site_settings where key = 'code_prefix';
  pref := upper(coalesce(pref, 'TEAM'));
  for i in 1..n loop
    loop
      bytes := gen_random_bytes(8); code := pref || '-';
      for j in 0..7 loop
        code := code || substr(alphabet, (get_byte(bytes, j) % 31) + 1, 1);
        if j = 3 then code := code || '-'; end if;
      end loop;
      begin
        insert into team_codes(code, role_id, email, bypass_domain, expires_at, note, tryout_application_id, created_by)
        values (code, p_role_id, nullif(lower(trim(p_email)),''), p_bypass_domain,
                case when p_expires_days is null then null else now() + (p_expires_days * interval '1 day') end,
                p_note, p_application, auth.uid())
        returning * into r;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    return next r;
  end loop;
end $$;

-- ═════════ SEEDS ═════════
insert into site_settings(key, value) values
  ('signup_requires_code','true'), ('allowed_email_domains','[]'), ('code_prefix','"SS"') on conflict do nothing;
insert into tryout_fields(key,label,type,options,required,sort_order) values
  ('phone','Phone number','text',null,false,1),
  ('preferred_position','Preferred position','select','["Goalkeeper","Defender","Midfielder","Forward"]',false,2),
  ('experience','Playing experience','longtext',null,false,3),
  ('notes','Anything else we should know?','longtext',null,false,4);
insert into permissions(key, description) values
  ('tryouts.manage','Manage tryouts and review applications'), ('codes.manage','Generate and revoke team codes');
insert into role_permissions select r.id, p.key from roles r join permissions p on p.key in ('tryouts.manage','codes.manage') where r.name in ('Admin','Manager');
insert into role_permissions select r.id, 'tryouts.manage' from roles r where r.name = 'Coach';
insert into nav_items(label, route, sort_order) values ('Tryouts','/tryouts',10);

create trigger audit after insert or update or delete on team_codes for each row execute function log_change();
