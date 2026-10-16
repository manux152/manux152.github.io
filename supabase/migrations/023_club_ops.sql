-- Super Strikers — Phase 23: club operations
--   parent/guardian accounts · consent forms & waivers · membership fees & receipts · kit tracking
--   sponsor placements with view/click reports · volunteer and transport rotas
-- Safe to run more than once.
--
-- PRIVACY: everything about a child (consents, fees, kit, injuries, feedback) is visible only to
--   • staff with the matching permission,
--   • the player themself (if they have an account), and
--   • guardians whom the club has linked to that player with a one-time code.
-- Other members, fans and the public see none of it. Rota sign-ups show first name + last initial only.

-- ═════════ Permissions ═════════
insert into permissions(key, description) values
  ('families.manage', 'Link guardians to players and manage consent forms and waivers'),
  ('fees.manage', 'Create membership fees, record payments and issue receipts'),
  ('kit.manage', 'Issue and collect kit'),
  ('rotas.manage', 'Create volunteer and transport rotas')
on conflict do nothing;
insert into role_permissions(role_id, permission_key)
select r.id, p.key from roles r
join (values ('families.manage', 'admin'), ('families.manage', 'manager'),
             ('fees.manage', 'admin'), ('fees.manage', 'manager'),
             ('kit.manage', 'admin'), ('kit.manage', 'manager'), ('kit.manage', 'coach'),
             ('rotas.manage', 'admin'), ('rotas.manage', 'manager'), ('rotas.manage', 'coach')) as p(key, rname) on lower(r.name) = p.rname
on conflict do nothing;

insert into site_settings(key, value) values ('rotas_enabled', 'true'), ('fee_payment_instructions', '""') on conflict do nothing;

-- ═════════ Guardians ═════════
alter table players add column if not exists requires_guardian boolean not null default false;   -- set by staff for players under 18 (we do not store dates of birth)

create table if not exists player_guardians (
  player_id uuid not null references players(id) on delete cascade,
  guardian_id uuid not null references profiles(id) on delete cascade,
  relationship text not null default 'parent' check (relationship in ('parent', 'guardian', 'carer', 'other')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (player_id, guardian_id)
);
-- Older version of this table already there? Add any columns it is missing.
alter table player_guardians add column if not exists player_id uuid references players(id) on delete cascade;
alter table player_guardians add column if not exists guardian_id uuid references profiles(id) on delete cascade;
alter table player_guardians add column if not exists relationship text not null default 'parent' check (relationship in ('parent', 'guardian', 'carer', 'other'));
alter table player_guardians add column if not exists created_by uuid references profiles(id) on delete set null;
alter table player_guardians add column if not exists created_at timestamptz not null default now();
create index if not exists player_guardians_guardian_idx on player_guardians (guardian_id);

create table if not exists guardian_codes (
  code text primary key,
  player_id uuid not null references players(id) on delete cascade,
  relationship text not null default 'parent' check (relationship in ('parent', 'guardian', 'carer', 'other')),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references profiles(id) on delete set null,
  used_at timestamptz
);
-- Older version of this table already there? Add any columns it is missing.
alter table guardian_codes add column if not exists code text;
alter table guardian_codes add column if not exists player_id uuid references players(id) on delete cascade;
alter table guardian_codes add column if not exists relationship text not null default 'parent' check (relationship in ('parent', 'guardian', 'carer', 'other'));
alter table guardian_codes add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table guardian_codes add column if not exists created_at timestamptz not null default now();
alter table guardian_codes add column if not exists expires_at timestamptz not null default now() + interval '14 days';
alter table guardian_codes add column if not exists used_by uuid references profiles(id) on delete set null;
alter table guardian_codes add column if not exists used_at timestamptz;
create table if not exists guardian_code_failures (user_id uuid not null, at timestamptz not null default now());
create index if not exists guardian_code_failures_idx on guardian_code_failures (user_id, at desc);

create or replace function is_guardian_of(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from player_guardians g where g.player_id = p_player and g.guardian_id = auth.uid());
$$;
-- the player themself (when they have an account) or a linked guardian
create or replace function can_act_for(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_guardian_of(p_player) or exists (select 1 from players p where p.id = p_player and p.profile_id = auth.uid());
$$;

alter table player_guardians enable row level security;
alter table guardian_codes enable row level security;
alter table guardian_code_failures enable row level security;
drop policy if exists "read" on player_guardians; drop policy if exists "staff" on player_guardians; drop policy if exists "leave" on player_guardians;
drop policy if exists "staff" on guardian_codes;
create policy "read" on player_guardians for select to authenticated using (guardian_id = auth.uid() or has_permission('families.manage'));
create policy "staff" on player_guardians for all to authenticated using (has_permission('families.manage')) with check (has_permission('families.manage'));
create policy "leave" on player_guardians for delete to authenticated using (guardian_id = auth.uid());
create policy "staff" on guardian_codes for all to authenticated using (has_permission('families.manage')) with check (has_permission('families.manage'));

create or replace function guardian_code_create(p_player uuid, p_relationship text default 'parent') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; bytes bytea;
begin
  if not has_permission('families.manage') then raise exception 'Not allowed'; end if;
  if not exists (select 1 from players where id = p_player) then raise exception 'Player not found'; end if;
  loop
    bytes := gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from guardian_codes where code = c);
  end loop;
  insert into guardian_codes(code, player_id, relationship) values (c, p_player, coalesce(nullif(p_relationship, ''), 'parent'));
  return c;
end $$;
revoke all on function guardian_code_create(uuid, text) from public, anon;
grant execute on function guardian_code_create(uuid, text) to authenticated;

create or replace function guardian_code_redeem(p_code text) returns text            -- the child's name, or null when the code did not work
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gc guardian_codes; nm text;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  if (select count(*) from guardian_code_failures where user_id = uid and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong codes. Please try again in an hour'; end if;
  select * into gc from guardian_codes where code = upper(trim(coalesce(p_code, ''))) and used_at is null and expires_at > now() for update;
  if not found then
    insert into guardian_code_failures(user_id) values (uid);
    return null;                      -- not an error, so the failed attempt is kept and counts towards the hourly limit
  end if;
  if (select count(*) from player_guardians where player_id = gc.player_id) >= 4 then raise exception 'This player already has the maximum number of guardians'; end if;
  insert into player_guardians(player_id, guardian_id, relationship, created_by) values (gc.player_id, uid, gc.relationship, gc.created_by) on conflict do nothing;
  update guardian_codes set used_by = uid, used_at = now() where code = gc.code;
  select full_name into nm from players where id = gc.player_id;
  return nm;
end $$;
revoke all on function guardian_code_redeem(text) from public, anon;
grant execute on function guardian_code_redeem(text) to authenticated;

-- The people I look after in the app: myself (if I'm a player) and my linked children
create or replace function my_family() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'self')::boolean desc, x->>'name') from (
      select jsonb_build_object('player_id', p.id, 'name', p.full_name, 'photo_url', p.photo_url, 'self', true, 'relationship', 'self', 'requires_guardian', p.requires_guardian) x
        from players p where p.profile_id = auth.uid()
      union all
      select jsonb_build_object('player_id', p.id, 'name', p.full_name, 'photo_url', p.photo_url, 'self', false, 'relationship', g.relationship, 'requires_guardian', p.requires_guardian)
        from player_guardians g join players p on p.id = g.player_id where g.guardian_id = auth.uid() and (p.profile_id is distinct from auth.uid())
    ) q), '[]'::jsonb);
end $$;
grant execute on function my_family() to authenticated;

-- Phase 21 follow-up: guardians can read their child's injury record and the feedback coaches shared
drop policy if exists "own read" on player_injuries;
create policy "own read" on player_injuries for select to authenticated using (can_act_for(player_id));
drop policy if exists "own shared read" on player_ratings;
create policy "own shared read" on player_ratings for select to authenticated using (shared and can_act_for(player_id));

-- ═════════ Consent forms & waivers ═════════
create table if not exists consent_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 120),
  body text not null check (length(body) between 20 and 8000),
  version int not null default 1,
  applies_to text not null default 'all' check (applies_to in ('all', 'minors')),     -- 'minors' = players marked "needs a guardian"
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table consent_forms add column if not exists id uuid default gen_random_uuid();
alter table consent_forms add column if not exists title text check (length(title) between 3 and 120);
alter table consent_forms add column if not exists body text check (length(body) between 20 and 8000);
alter table consent_forms add column if not exists version int not null default 1;
alter table consent_forms add column if not exists applies_to text not null default 'all' check (applies_to in ('all', 'minors'));
alter table consent_forms add column if not exists is_required boolean not null default true;
alter table consent_forms add column if not exists is_active boolean not null default true;
alter table consent_forms add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table consent_forms add column if not exists created_at timestamptz not null default now();
alter table consent_forms add column if not exists updated_at timestamptz not null default now();
create or replace function bump_consent_version() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body or new.title is distinct from old.title then new.version := old.version + 1; end if;   -- new wording = everyone signs again
  new.updated_at := now(); return new;
end $$;
drop trigger if exists bump on consent_forms;
create trigger bump before update on consent_forms for each row execute function bump_consent_version();

create table if not exists consent_signatures (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references consent_forms(id) on delete cascade,
  form_version int not null,
  player_id uuid not null references players(id) on delete cascade,
  signed_by uuid references profiles(id) on delete set null,
  signer_name text not null check (length(signer_name) between 2 and 120),
  relationship text not null check (relationship in ('self', 'parent', 'guardian', 'carer', 'other')),
  title_snapshot text not null,
  body_snapshot text not null,                        -- exactly what was agreed to, even if the form is edited later
  signed_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references profiles(id) on delete set null,
  unique (form_id, form_version, player_id)
);
-- Older version of this table already there? Add any columns it is missing.
alter table consent_signatures add column if not exists id uuid default gen_random_uuid();
alter table consent_signatures add column if not exists form_id uuid references consent_forms(id) on delete cascade;
alter table consent_signatures add column if not exists form_version int;
alter table consent_signatures add column if not exists player_id uuid references players(id) on delete cascade;
alter table consent_signatures add column if not exists signed_by uuid references profiles(id) on delete set null;
alter table consent_signatures add column if not exists signer_name text check (length(signer_name) between 2 and 120);
alter table consent_signatures add column if not exists relationship text check (relationship in ('self', 'parent', 'guardian', 'carer', 'other'));
alter table consent_signatures add column if not exists title_snapshot text;
alter table consent_signatures add column if not exists body_snapshot text;
alter table consent_signatures add column if not exists signed_at timestamptz not null default now();
alter table consent_signatures add column if not exists withdrawn_at timestamptz;
alter table consent_signatures add column if not exists withdrawn_by uuid references profiles(id) on delete set null;
create index if not exists consent_signatures_player_idx on consent_signatures (player_id);

alter table consent_forms enable row level security;
alter table consent_signatures enable row level security;
drop policy if exists "read" on consent_forms; drop policy if exists "manage" on consent_forms;
drop policy if exists "read" on consent_signatures; drop policy if exists "manage" on consent_signatures;
create policy "read" on consent_forms for select to authenticated using (is_active or has_permission('families.manage'));
create policy "manage" on consent_forms for all to authenticated using (has_permission('families.manage')) with check (has_permission('families.manage'));
create policy "read" on consent_signatures for select to authenticated using (has_permission('families.manage') or can_act_for(player_id));
-- signing and withdrawing go through the functions below, never straight into the table

create or replace function consent_sign(p_form uuid, p_player uuid, p_name text, p_relationship text) returns void
language plpgsql security definer set search_path = public as $$
declare f consent_forms; pl players; guard boolean; selfp boolean; nm text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  select * into f from consent_forms where id = p_form and is_active;
  if not found then raise exception 'This form is no longer open'; end if;
  select * into pl from players where id = p_player;
  if not found then raise exception 'Player not found'; end if;
  if f.applies_to = 'minors' and not pl.requires_guardian then raise exception 'This form does not apply to this player'; end if;
  guard := is_guardian_of(p_player); selfp := (pl.profile_id = auth.uid());
  if not guard and not selfp then raise exception 'You are not linked to this player'; end if;
  if length(nm) < 2 then raise exception 'Type the full name of the person signing'; end if;
  if pl.requires_guardian and not guard then raise exception 'A parent or guardian must sign for this player'; end if;
  if selfp and not guard then p_relationship := 'self';
  elsif p_relationship is null or p_relationship not in ('parent', 'guardian', 'carer', 'other') then
    p_relationship := (select relationship from player_guardians where player_id = p_player and guardian_id = auth.uid()); end if;
  insert into consent_signatures(form_id, form_version, player_id, signed_by, signer_name, relationship, title_snapshot, body_snapshot)
  values (f.id, f.version, p_player, auth.uid(), left(nm, 120), p_relationship, f.title, f.body)
  on conflict (form_id, form_version, player_id) do update
    set signed_by = excluded.signed_by, signer_name = excluded.signer_name, relationship = excluded.relationship,
        signed_at = now(), withdrawn_at = null, withdrawn_by = null
    where consent_signatures.withdrawn_at is not null;       -- already signed and not withdrawn: nothing to change
end $$;
revoke all on function consent_sign(uuid, uuid, text, text) from public, anon;
grant execute on function consent_sign(uuid, uuid, text, text) to authenticated;

create or replace function consent_withdraw(p_signature uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s consent_signatures;
begin
  select * into s from consent_signatures where id = p_signature;
  if not found then return; end if;
  if not (can_act_for(s.player_id) or has_permission('families.manage')) then raise exception 'Not allowed'; end if;
  update consent_signatures set withdrawn_at = now(), withdrawn_by = auth.uid() where id = p_signature and withdrawn_at is null;
end $$;
revoke all on function consent_withdraw(uuid) from public, anon;
grant execute on function consent_withdraw(uuid) to authenticated;

-- Forms that apply to this player, and whether the current version has been signed
create or replace function consent_overview(p_player uuid)
returns table (form_id uuid, title text, body text, version int, is_required boolean, signature_id uuid, signed_at timestamptz, signer_name text, withdrawn_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (can_act_for(p_player) or has_permission('families.manage')) then raise exception 'Not allowed'; end if;
  return query
    select f.id, f.title, f.body, f.version, f.is_required, s.id, s.signed_at, s.signer_name, s.withdrawn_at
    from consent_forms f join players p on p.id = p_player
    left join consent_signatures s on s.form_id = f.id and s.form_version = f.version and s.player_id = p_player
    where f.is_active and (f.applies_to = 'all' or p.requires_guardian)
    order by f.is_required desc, f.created_at;
end $$;
revoke all on function consent_overview(uuid) from public, anon;
grant execute on function consent_overview(uuid) to authenticated;

-- Staff: who has and hasn't signed one form
create or replace function consent_roster(p_form uuid)
returns table (player_id uuid, name text, requires_guardian boolean, signed_at timestamptz, signer_name text, relationship text, withdrawn_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('families.manage') then raise exception 'Not allowed'; end if;
  return query
    select p.id, p.full_name, p.requires_guardian, s.signed_at, s.signer_name, s.relationship, s.withdrawn_at
    from consent_forms f join players p on p.is_active and (f.applies_to = 'all' or p.requires_guardian)
    left join consent_signatures s on s.form_id = f.id and s.form_version = f.version and s.player_id = p.id
    where f.id = p_form order by (s.signed_at is not null and s.withdrawn_at is null), p.full_name;
end $$;
revoke all on function consent_roster(uuid) from public, anon;
grant execute on function consent_roster(uuid) to authenticated;

-- Staff: Admin → Families overview
create or replace function families_admin()
returns table (player_id uuid, name text, photo_url text, requires_guardian boolean, guardians jsonb, missing_forms bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('families.manage') then raise exception 'Not allowed'; end if;
  return query
    select p.id, p.full_name, p.photo_url, p.requires_guardian,
      coalesce((select jsonb_agg(jsonb_build_object('guardian_id', g.guardian_id, 'name', fan_name(g.guardian_id), 'relationship', g.relationship) order by g.created_at) from player_guardians g where g.player_id = p.id), '[]'::jsonb),
      (select count(*) from consent_forms f where f.is_active and f.is_required and (f.applies_to = 'all' or p.requires_guardian)
         and not exists (select 1 from consent_signatures s where s.form_id = f.id and s.form_version = f.version and s.player_id = p.id and s.withdrawn_at is null))
    from players p where p.is_active order by p.full_name;
end $$;
revoke all on function families_admin() from public, anon;
grant execute on function families_admin() to authenticated;

-- ═════════ Membership fees & receipts ═════════
create table if not exists fee_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  amount numeric(10, 2) not null check (amount >= 0),
  billing text not null default 'monthly' check (billing in ('once', 'monthly', 'termly', 'yearly')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table fee_plans add column if not exists id uuid default gen_random_uuid();
alter table fee_plans add column if not exists name text check (length(name) between 2 and 80);
alter table fee_plans add column if not exists amount numeric(10, 2) check (amount >= 0);
alter table fee_plans add column if not exists billing text not null default 'monthly' check (billing in ('once', 'monthly', 'termly', 'yearly'));
alter table fee_plans add column if not exists description text;
alter table fee_plans add column if not exists is_active boolean not null default true;
alter table fee_plans add column if not exists created_at timestamptz not null default now();
create sequence if not exists fee_receipt_seq;
create table if not exists fee_invoices (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  plan_id uuid references fee_plans(id) on delete set null,
  title text not null check (length(title) between 2 and 120),
  amount numeric(10, 2) not null check (amount >= 0),
  due_on date not null,
  status text not null default 'due' check (status in ('due', 'paid', 'waived', 'cancelled')),
  paid_on date,
  method text check (method is null or method in ('cash', 'mobile_money', 'bank', 'card', 'other')),
  reference text check (reference is null or length(reference) <= 80),
  receipt_no text unique,
  note text check (note is null or length(note) <= 300),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table fee_invoices add column if not exists id uuid default gen_random_uuid();
alter table fee_invoices add column if not exists player_id uuid references players(id) on delete cascade;
alter table fee_invoices add column if not exists plan_id uuid references fee_plans(id) on delete set null;
alter table fee_invoices add column if not exists title text check (length(title) between 2 and 120);
alter table fee_invoices add column if not exists amount numeric(10, 2) check (amount >= 0);
alter table fee_invoices add column if not exists due_on date;
alter table fee_invoices add column if not exists status text not null default 'due' check (status in ('due', 'paid', 'waived', 'cancelled'));
alter table fee_invoices add column if not exists paid_on date;
alter table fee_invoices add column if not exists method text check (method is null or method in ('cash', 'mobile_money', 'bank', 'card', 'other'));
alter table fee_invoices add column if not exists reference text check (reference is null or length(reference) <= 80);
alter table fee_invoices add column if not exists receipt_no text;
alter table fee_invoices add column if not exists note text check (note is null or length(note) <= 300);
alter table fee_invoices add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table fee_invoices add column if not exists created_at timestamptz not null default now();
create index if not exists fee_invoices_player_idx on fee_invoices (player_id, due_on desc);
create index if not exists fee_invoices_open_idx on fee_invoices (due_on) where status = 'due';

alter table fee_plans enable row level security;
alter table fee_invoices enable row level security;
drop policy if exists "staff" on fee_plans; drop policy if exists "staff" on fee_invoices; drop policy if exists "family read" on fee_invoices;
create policy "staff" on fee_plans for all to authenticated using (has_permission('fees.manage')) with check (has_permission('fees.manage'));
create policy "staff" on fee_invoices for all to authenticated using (has_permission('fees.manage')) with check (has_permission('fees.manage'));
create policy "family read" on fee_invoices for select to authenticated using (can_act_for(player_id));

create or replace function fee_mark_paid(p_invoice uuid, p_method text, p_reference text default null) returns text
language plpgsql security definer set search_path = public as $$
declare inv fee_invoices; rn text;
begin
  if not has_permission('fees.manage') then raise exception 'Not allowed'; end if;
  if p_method not in ('cash', 'mobile_money', 'bank', 'card', 'other') then raise exception 'Choose how it was paid'; end if;
  select * into inv from fee_invoices where id = p_invoice for update;
  if not found then raise exception 'Not found'; end if;
  if inv.status = 'paid' then return inv.receipt_no; end if;
  if inv.status <> 'due' then raise exception 'Only a due invoice can be marked paid'; end if;
  rn := 'R-' || lpad(nextval('fee_receipt_seq')::text, 6, '0');
  update fee_invoices set status = 'paid', paid_on = current_date, method = p_method, reference = left(nullif(trim(coalesce(p_reference, '')), ''), 80), receipt_no = rn where id = p_invoice;
  return rn;
end $$;
revoke all on function fee_mark_paid(uuid, text, text) from public, anon;
grant execute on function fee_mark_paid(uuid, text, text) to authenticated;

-- Create one invoice per player for a plan and due date (skips anyone who already has it)
create or replace function fee_generate(p_plan uuid, p_due date, p_players uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare pl fee_plans; n int;
begin
  if not has_permission('fees.manage') then raise exception 'Not allowed'; end if;
  select * into pl from fee_plans where id = p_plan and is_active;
  if not found then raise exception 'Plan not found'; end if;
  insert into fee_invoices(player_id, plan_id, title, amount, due_on)
  select p.id, pl.id, pl.name || ' · ' || to_char(p_due, 'Mon YYYY'), pl.amount, p_due
  from players p
  where p.is_active and (p_players is null or p.id = any(p_players))
    and not exists (select 1 from fee_invoices i where i.player_id = p.id and i.plan_id = pl.id and i.due_on = p_due and i.status <> 'cancelled');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function fee_generate(uuid, date, uuid[]) from public, anon;
grant execute on function fee_generate(uuid, date, uuid[]) to authenticated;

create or replace function fee_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('fees.manage') then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'due_total', coalesce((select sum(amount) from fee_invoices where status = 'due'), 0),
    'overdue_total', coalesce((select sum(amount) from fee_invoices where status = 'due' and due_on < current_date), 0),
    'overdue_count', (select count(*) from fee_invoices where status = 'due' and due_on < current_date),
    'paid_this_month', coalesce((select sum(amount) from fee_invoices where status = 'paid' and date_trunc('month', paid_on) = date_trunc('month', current_date)), 0));
end $$;
revoke all on function fee_summary() from public, anon;
grant execute on function fee_summary() to authenticated;

-- ═════════ Kit ═════════
create table if not exists kit_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  stock_total int check (stock_total is null or stock_total >= 0),     -- optional: how many you own
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table kit_types add column if not exists id uuid default gen_random_uuid();
alter table kit_types add column if not exists name text check (length(name) between 2 and 80);
alter table kit_types add column if not exists stock_total int check (stock_total is null or stock_total >= 0);
alter table kit_types add column if not exists is_active boolean not null default true;
alter table kit_types add column if not exists created_at timestamptz not null default now();
create table if not exists kit_issues (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  kit_type_id uuid not null references kit_types(id) on delete cascade,
  size text check (size is null or length(size) <= 20),
  shirt_number int check (shirt_number is null or shirt_number between 0 and 99),
  issued_on date not null default current_date,
  due_back_on date,
  returned_on date,
  note text check (note is null or length(note) <= 300),
  issued_by uuid references profiles(id) on delete set null default auth.uid()
);
-- Older version of this table already there? Add any columns it is missing.
alter table kit_issues add column if not exists id uuid default gen_random_uuid();
alter table kit_issues add column if not exists player_id uuid references players(id) on delete cascade;
alter table kit_issues add column if not exists kit_type_id uuid references kit_types(id) on delete cascade;
alter table kit_issues add column if not exists size text check (size is null or length(size) <= 20);
alter table kit_issues add column if not exists shirt_number int check (shirt_number is null or shirt_number between 0 and 99);
alter table kit_issues add column if not exists issued_on date not null default current_date;
alter table kit_issues add column if not exists due_back_on date;
alter table kit_issues add column if not exists returned_on date;
alter table kit_issues add column if not exists note text check (note is null or length(note) <= 300);
alter table kit_issues add column if not exists issued_by uuid references profiles(id) on delete set null default auth.uid();
create index if not exists kit_issues_player_idx on kit_issues (player_id);
create index if not exists kit_issues_out_idx on kit_issues (kit_type_id) where returned_on is null;

alter table kit_types enable row level security;
alter table kit_issues enable row level security;
drop policy if exists "staff" on kit_types; drop policy if exists "staff" on kit_issues; drop policy if exists "family read" on kit_issues;
create policy "staff" on kit_types for all to authenticated using (has_permission('kit.manage')) with check (has_permission('kit.manage'));
create policy "staff" on kit_issues for all to authenticated using (has_permission('kit.manage')) with check (has_permission('kit.manage'));
create policy "family read" on kit_issues for select to authenticated using (can_act_for(player_id));
drop policy if exists "family read types" on kit_types;
create policy "family read types" on kit_types for select to authenticated using (exists (select 1 from kit_issues i where i.kit_type_id = kit_types.id and can_act_for(i.player_id)));

-- What needs attention for me and my children (for the dashboard tile)
create or replace function family_attention() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ids uuid[]; forms int := 0; fees int := 0; kit int := 0; pid uuid;
begin
  if auth.uid() is null then return jsonb_build_object('forms', 0, 'fees', 0, 'kit', 0); end if;
  select array_agg(p.id) into ids from players p where p.profile_id = auth.uid() or exists (select 1 from player_guardians g where g.player_id = p.id and g.guardian_id = auth.uid());
  if ids is null then return jsonb_build_object('forms', 0, 'fees', 0, 'kit', 0); end if;
  foreach pid in array ids loop
    forms := forms + (select count(*) from consent_forms f join players p on p.id = pid where f.is_active and f.is_required and (f.applies_to = 'all' or p.requires_guardian)
      and not exists (select 1 from consent_signatures s where s.form_id = f.id and s.form_version = f.version and s.player_id = pid and s.withdrawn_at is null));
  end loop;
  select count(*) into fees from fee_invoices where player_id = any(ids) and status = 'due' and due_on < current_date;
  select count(*) into kit from kit_issues where player_id = any(ids) and returned_on is null and due_back_on is not null and due_back_on < current_date;
  return jsonb_build_object('forms', forms, 'fees', fees, 'kit', kit);
end $$;
grant execute on function family_attention() to authenticated;

-- ═════════ Sponsors: placements, dates, and view/click reports ═════════
alter table sponsors add column if not exists tier text not null default 'partner' check (tier in ('headline', 'gold', 'silver', 'bronze', 'partner'));
alter table sponsors add column if not exists starts_on date;
alter table sponsors add column if not exists ends_on date;
alter table sponsors add column if not exists show_footer boolean not null default true;      -- website footer (what existed before)
alter table sponsors add column if not exists show_home boolean not null default false;        -- strip on the home page
alter table sponsors add column if not exists show_match boolean not null default false;       -- strip on match pages
drop policy if exists "public read" on sponsors;
create policy "public read" on sponsors for select using (
  (is_active and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date)) or has_permission('settings.manage'));

create table if not exists sponsor_stats (
  sponsor_id uuid not null references sponsors(id) on delete cascade,
  day date not null default current_date,
  placement text not null check (placement in ('footer', 'home', 'match')),
  views int not null default 0,
  clicks int not null default 0,
  primary key (sponsor_id, day, placement)
);
-- Older version of this table already there? Add any columns it is missing.
alter table sponsor_stats add column if not exists sponsor_id uuid references sponsors(id) on delete cascade;
alter table sponsor_stats add column if not exists day date not null default current_date;
alter table sponsor_stats add column if not exists placement text check (placement in ('footer', 'home', 'match'));
alter table sponsor_stats add column if not exists views int not null default 0;
alter table sponsor_stats add column if not exists clicks int not null default 0;
alter table sponsor_stats enable row level security;
drop policy if exists "staff" on sponsor_stats;
create policy "staff" on sponsor_stats for select using (has_permission('settings.manage'));

-- Private commercial details never live on the public sponsors table
create table if not exists sponsor_deals (
  sponsor_id uuid primary key references sponsors(id) on delete cascade,
  contact_name text, contact_email text,
  value numeric(12, 2) check (value is null or value >= 0),
  notes text check (notes is null or length(notes) <= 1000),
  updated_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table sponsor_deals add column if not exists sponsor_id uuid references sponsors(id) on delete cascade;
alter table sponsor_deals add column if not exists contact_name text;
alter table sponsor_deals add column if not exists contact_email text;
alter table sponsor_deals add column if not exists value numeric(12, 2) check (value is null or value >= 0);
alter table sponsor_deals add column if not exists notes text check (notes is null or length(notes) <= 1000);
alter table sponsor_deals add column if not exists updated_at timestamptz not null default now();
alter table sponsor_deals enable row level security;
drop policy if exists "staff" on sponsor_deals;
create policy "staff" on sponsor_deals for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

-- Anyone can record a view or click for an active sponsor. Counts are approximate (the app counts once per visit).
create or replace function sponsor_track(p_sponsor uuid, p_placement text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_placement not in ('footer', 'home', 'match') or p_kind not in ('view', 'click') then return; end if;
  if not exists (select 1 from sponsors where id = p_sponsor and is_active) then return; end if;
  insert into sponsor_stats(sponsor_id, day, placement, views, clicks)
  values (p_sponsor, current_date, p_placement, (p_kind = 'view')::int, (p_kind = 'click')::int)
  on conflict (sponsor_id, day, placement) do update
    set views = sponsor_stats.views + (p_kind = 'view')::int, clicks = sponsor_stats.clicks + (p_kind = 'click')::int;
end $$;
grant execute on function sponsor_track(uuid, text, text) to anon, authenticated;

create or replace function sponsor_report(p_days int default 30)
returns table (sponsor_id uuid, name text, placement text, views bigint, clicks bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('settings.manage') then raise exception 'Not allowed'; end if;
  return query
    select s.id, s.name, st.placement, coalesce(sum(st.views), 0)::bigint, coalesce(sum(st.clicks), 0)::bigint
    from sponsors s left join sponsor_stats st on st.sponsor_id = s.id and st.day > current_date - greatest(1, least(coalesce(p_days, 30), 365))
    group by s.id, s.name, st.placement order by s.name, st.placement;
end $$;
revoke all on function sponsor_report(int) from public, anon;
grant execute on function sponsor_report(int) to authenticated;

-- ═════════ Rotas: volunteers and transport ═════════
create table if not exists rotas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 120),
  kind text not null default 'volunteer' check (kind in ('volunteer', 'transport')),
  match_id uuid references matches(id) on delete set null,
  starts_at timestamptz not null,
  location text check (location is null or length(location) <= 200),
  notes text check (notes is null or length(notes) <= 1000),
  is_published boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
-- Older version of this table already there? Add any columns it is missing.
alter table rotas add column if not exists id uuid default gen_random_uuid();
alter table rotas add column if not exists title text check (length(title) between 3 and 120);
alter table rotas add column if not exists kind text not null default 'volunteer' check (kind in ('volunteer', 'transport'));
alter table rotas add column if not exists match_id uuid references matches(id) on delete set null;
alter table rotas add column if not exists starts_at timestamptz;
alter table rotas add column if not exists location text check (location is null or length(location) <= 200);
alter table rotas add column if not exists notes text check (notes is null or length(notes) <= 1000);
alter table rotas add column if not exists is_published boolean not null default true;
alter table rotas add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid();
alter table rotas add column if not exists created_at timestamptz not null default now();
create table if not exists rota_slots (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references rotas(id) on delete cascade,
  label text not null check (length(label) between 1 and 80),
  capacity int not null default 1 check (capacity between 1 and 20),
  sort_order int not null default 0
);
-- Older version of this table already there? Add any columns it is missing.
alter table rota_slots add column if not exists id uuid default gen_random_uuid();
alter table rota_slots add column if not exists rota_id uuid references rotas(id) on delete cascade;
alter table rota_slots add column if not exists label text check (length(label) between 1 and 80);
alter table rota_slots add column if not exists capacity int not null default 1 check (capacity between 1 and 20);
alter table rota_slots add column if not exists sort_order int not null default 0;
create index if not exists rota_slots_rota_idx on rota_slots (rota_id, sort_order);
create table if not exists rota_signups (
  slot_id uuid not null references rota_slots(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  seats int check (seats is null or seats between 1 and 12),            -- transport: seats the driver can offer
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (slot_id, user_id)
);
-- Older version of this table already there? Add any columns it is missing.
alter table rota_signups add column if not exists slot_id uuid references rota_slots(id) on delete cascade;
alter table rota_signups add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table rota_signups add column if not exists seats int check (seats is null or seats between 1 and 12);
alter table rota_signups add column if not exists note text check (note is null or length(note) <= 200);
alter table rota_signups add column if not exists created_at timestamptz not null default now();

alter table rotas enable row level security;
alter table rota_slots enable row level security;
alter table rota_signups enable row level security;
drop policy if exists "read" on rotas; drop policy if exists "manage" on rotas;
drop policy if exists "read" on rota_slots; drop policy if exists "manage" on rota_slots;
drop policy if exists "own read" on rota_signups; drop policy if exists "manage" on rota_signups;
create policy "read" on rotas for select to authenticated using ((is_published and fan_flag('rotas_enabled', true)) or has_permission('rotas.manage'));
create policy "manage" on rotas for all to authenticated using (has_permission('rotas.manage')) with check (has_permission('rotas.manage'));
create policy "read" on rota_slots for select to authenticated using (exists (select 1 from rotas r where r.id = rota_id and ((r.is_published and fan_flag('rotas_enabled', true)) or has_permission('rotas.manage'))));
create policy "manage" on rota_slots for all to authenticated using (has_permission('rotas.manage')) with check (has_permission('rotas.manage'));
create policy "own read" on rota_signups for select to authenticated using (user_id = auth.uid() or has_permission('rotas.manage'));
create policy "manage" on rota_signups for all to authenticated using (has_permission('rotas.manage')) with check (has_permission('rotas.manage'));

create or replace function rota_signup(p_slot uuid, p_note text default null, p_seats int default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s rota_slots; r rotas; taken int;
begin
  if uid is null then raise exception 'Please sign in'; end if;
  select * into s from rota_slots where id = p_slot for update;
  if not found then raise exception 'Slot not found'; end if;
  select * into r from rotas where id = s.rota_id;
  if not (r.is_published and fan_flag('rotas_enabled', true)) then raise exception 'This rota is not open'; end if;
  if r.starts_at < now() then raise exception 'This one has already started'; end if;
  if exists (select 1 from rota_signups where slot_id = p_slot and user_id = uid) then raise exception 'You are already signed up for this'; end if;
  select count(*) into taken from rota_signups where slot_id = p_slot;
  if taken >= s.capacity then raise exception 'That slot is full'; end if;
  if r.kind = 'transport' and (p_seats is null or p_seats < 1 or p_seats > 12) then raise exception 'Say how many seats you can offer (1–12)'; end if;
  insert into rota_signups(slot_id, user_id, seats, note) values (p_slot, uid, case when r.kind = 'transport' then p_seats end, left(nullif(trim(coalesce(p_note, '')), ''), 200));
end $$;
revoke all on function rota_signup(uuid, text, int) from public, anon;
grant execute on function rota_signup(uuid, text, int) to authenticated;

create or replace function rota_withdraw(p_slot uuid) returns void
language sql security definer set search_path = public as $$
  delete from rota_signups where slot_id = p_slot and user_id = auth.uid();
$$;
revoke all on function rota_withdraw(uuid) from public, anon;
grant execute on function rota_withdraw(uuid) to authenticated;

-- Upcoming rotas with who is on each slot (names as first name + last initial)
create or replace function rotas_upcoming(p_include_past boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not fan_flag('rotas_enabled', true) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'kind', r.kind, 'match_id', r.match_id, 'starts_at', r.starts_at, 'location', r.location, 'notes', r.notes,
      'slots', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'capacity', s.capacity,
          'mine', exists (select 1 from rota_signups m where m.slot_id = s.id and m.user_id = auth.uid()),
          'people', coalesce((select jsonb_agg(jsonb_build_object('name', fan_name(u.user_id), 'seats', u.seats, 'note', u.note, 'user_id', case when has_permission('rotas.manage') then u.user_id end) order by u.created_at) from rota_signups u where u.slot_id = s.id), '[]'::jsonb)
        ) order by s.sort_order, s.label) from rota_slots s where s.rota_id = r.id), '[]'::jsonb)
    ) order by r.starts_at)
    from rotas r where r.is_published and (p_include_past or r.starts_at >= now() - interval '3 hours')), '[]'::jsonb);
end $$;
grant execute on function rotas_upcoming(boolean) to authenticated;

-- Staff with family access can mark a player as needing a guardian (the players table itself needs players.manage)
create or replace function player_set_guardian_required(p_player uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('families.manage') then raise exception 'Not allowed'; end if;
  update players set requires_guardian = coalesce(p_value, false) where id = p_player;
end $$;
revoke all on function player_set_guardian_required(uuid, boolean) from public, anon;
grant execute on function player_set_guardian_required(uuid, boolean) to authenticated;
