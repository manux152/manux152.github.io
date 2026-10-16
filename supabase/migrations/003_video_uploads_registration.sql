-- Super Strikers — Phase 3: video uploads + player registration with admin approval

-- ───────── Media bucket: allow video files (50 MB per file on the free plan; raise on Pro) ─────────
update storage.buckets set
  file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic',
                             'video/mp4','video/quicktime','video/webm']
where id = 'media';

-- ───────── Registration form (admin-defined fields) ─────────
create table registration_fields (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  type text not null default 'text' check (type in ('text','longtext','number','date','select')),
  options jsonb,                    -- for 'select': ["Option A","Option B"]
  required boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  answers jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Approve/reject; approval assigns the configured role and creates the player profile
create or replace function review_registration(reg_id uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r registrations; role_name text; rid uuid; pname text;
begin
  if not has_permission('registrations.manage') then raise exception 'Forbidden'; end if;
  if new_status not in ('approved','rejected') then raise exception 'Invalid status'; end if;
  select * into r from registrations where id = reg_id;
  if not found then raise exception 'Registration not found'; end if;
  update registrations set status = new_status, review_note = note,
    reviewed_by = auth.uid(), reviewed_at = now() where id = reg_id;
  if new_status = 'approved' then
    select value #>> '{}' into role_name from site_settings where key = 'registration_role';
    select id into rid from roles where name = coalesce(role_name, 'Player');
    if rid is not null then
      insert into user_roles(user_id, role_id) values (r.user_id, rid) on conflict do nothing;
    end if;
    select coalesce(nullif(r.answers->>'full_name',''), nullif(p.full_name,''), p.email, 'New player')
      into pname from profiles p where p.id = r.user_id;
    insert into players(profile_id, full_name) values (r.user_id, pname) on conflict (profile_id) do nothing;
  end if;
end $$;

-- ───────── Seeds ─────────
insert into permissions(key, description) values ('registrations.manage','Review player registrations and edit the form');
insert into role_permissions select r.id,'registrations.manage' from roles r where r.name in ('Admin','Manager');

insert into site_settings(key, value) values ('registration_open','true'), ('registration_role','"Player"')
  on conflict do nothing;

insert into registration_fields(key,label,type,options,required,sort_order) values
  ('full_name','Full name','text',null,true,1),
  ('phone','Phone number','text',null,false,2),
  ('date_of_birth','Date of birth (YYYY-MM-DD)','date',null,false,3),
  ('preferred_position','Preferred position','select','["Goalkeeper","Defender","Midfielder","Forward"]',false,4),
  ('notes','Anything else we should know?','longtext',null,false,5);

-- ───────── RLS ─────────
alter table registration_fields enable row level security;
alter table registrations enable row level security;

create policy "public read" on registration_fields for select using (is_active or has_permission('registrations.manage'));
create policy "manage" on registration_fields for all using (has_permission('registrations.manage'));

create policy "own or reviewer read" on registrations for select to authenticated
  using (user_id = auth.uid() or has_permission('registrations.manage'));
create policy "submit own" on registrations for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "resubmit if rejected" on registrations for update to authenticated
  using (user_id = auth.uid() and status = 'rejected') with check (user_id = auth.uid() and status = 'pending');
create policy "manage" on registrations for all using (has_permission('registrations.manage'));
