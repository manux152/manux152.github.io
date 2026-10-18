-- Super Strikers — Phase 42: levels of hierarchy.
-- Every role has a level (higher = more authority). You can only delete, deactivate or change the roles of accounts whose
-- level is BELOW yours, and you can only give roles below your own level (the top level may give any role).
-- Nobody can manage themselves here, and nobody can manage an equal or higher account (so an Admin cannot remove an Admin or Super Admin).
-- Writes from the SQL Editor and from our Edge Functions are not affected by these triggers; delete-user and create-user check the same rules themselves.
-- Safe to re-run.

alter table roles add column if not exists level int not null default 10;
do $$ begin
  alter table roles add constraint roles_level_range check (level between 0 and 100);
exception when duplicate_object then null; end $$;

-- Starting levels for the built-in and known roles (anything else stays at 10 and can be changed in Admin → Roles)
update roles set level = case lower(replace(replace(name, '-', ' '), '_', ' '))
  when 'super admin' then 100 when 'superadmin' then 100
  when 'admin' then 80 when 'manager' then 60 when 'coach' then 40 when 'captain' then 20 when 'player' then 10
  else level end;

-- ───────── helpers ─────────
create or replace function role_level(rid uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select level from roles where id = rid), 0);
$$;
create or replace function user_level(uid uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(r.level), 0) from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = uid;
$$;
create or replace function my_level() returns int language sql stable security definer set search_path = public as $$
  select user_level(auth.uid());
$$;
-- The highest level that exists (for example Super Admin) may give any role
create or replace function my_is_top() returns boolean language sql stable security definer set search_path = public as $$
  select my_level() > 0 and my_level() >= (select coalesce(max(level), 0) from roles);
$$;
create or replace function can_manage_user(target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and target is distinct from auth.uid() and my_level() > user_level(target);
$$;
revoke execute on function role_level(uuid), user_level(uuid), my_level(), my_is_top(), can_manage_user(uuid) from public, anon;
grant execute on function role_level(uuid), user_level(uuid), my_level(), my_is_top(), can_manage_user(uuid) to authenticated;

-- ───────── guards (only for people editing through the app; the SQL Editor and Edge Functions pass through) ─────────
-- Deactivate / reactivate
create or replace function guard_profile_hierarchy() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and new.is_active is distinct from old.is_active and not can_manage_user(old.id) then
    raise exception 'You can only deactivate or activate accounts below your own level';
  end if;
  return new;
end $$;
drop trigger if exists profiles_hierarchy on profiles;
create trigger profiles_hierarchy before update of is_active on profiles for each row execute function guard_profile_hierarchy();

-- Give / remove roles
create or replace function guard_user_roles_hierarchy() returns trigger language plpgsql set search_path = public as $$
declare uid uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if current_user = 'authenticated' then
    if not can_manage_user(uid) then raise exception 'You can only change the roles of accounts below your own level'; end if;
    if tg_op = 'INSERT' and not (role_level(new.role_id) < my_level() or my_is_top()) then
      raise exception 'You can only give roles below your own level';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists user_roles_hierarchy on user_roles;
create trigger user_roles_hierarchy before insert or delete on user_roles for each row execute function guard_user_roles_hierarchy();

-- Create / edit / delete roles and their levels
create or replace function guard_roles_hierarchy() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not my_is_top() then
    if tg_op in ('UPDATE', 'DELETE') and old.level >= my_level() then raise exception 'You can only change roles below your own level'; end if;
    if tg_op in ('INSERT', 'UPDATE') and new.level >= my_level() then raise exception 'A role''s level must be below your own level'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists roles_hierarchy on roles;
create trigger roles_hierarchy before insert or update or delete on roles for each row execute function guard_roles_hierarchy();

-- Edit what a role may do
create or replace function guard_role_permissions_hierarchy() returns trigger language plpgsql set search_path = public as $$
declare rid uuid := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
begin
  if current_user = 'authenticated' and not (role_level(rid) < my_level() or my_is_top()) then
    raise exception 'You can only edit the permissions of roles below your own level';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists role_permissions_hierarchy on role_permissions;
create trigger role_permissions_hierarchy before insert or delete on role_permissions for each row execute function guard_role_permissions_hierarchy();
