-- Super Strikers — Phase 19: member chat (text, emojis, stickers, photos, voice calls) with safeguarding controls
-- Safe to run more than once.

-- ═════════ Permission for moderators ═════════
insert into permissions(key, description) values ('chat.moderate', 'Review reported chat messages, remove messages and stop people from chatting')
on conflict do nothing;
insert into role_permissions(role_id, permission_key)
select id, 'chat.moderate' from roles where lower(name) in ('admin', 'super admin', 'super_admin', 'superadmin')
on conflict do nothing;

-- ═════════ Tables ═════════
create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'team')),
  title text,
  direct_key text unique,                 -- "smallerUserId:largerUserId" so two people always share ONE direct room
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create unique index if not exists chat_one_team_room on chat_rooms (kind) where kind = 'team';

create table if not exists chat_members (
  room_id uuid not null references chat_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists chat_members_user_idx on chat_members (user_id);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  kind text not null check (kind in ('text', 'image', 'sticker', 'call', 'system')),
  body text check (body is null or length(body) <= 2000),
  image_path text,                         -- path inside the private "chat" bucket: <room id>/<file>
  sticker_url text check (sticker_url is null or sticker_url ~* '^https://'),
  call_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_messages_room_idx on chat_messages (room_id, created_at desc);

create table if not exists chat_reactions (
  message_id uuid not null references chat_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  primary key (message_id, user_id, emoji)
);

create table if not exists chat_stickers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null check (image_url ~* '^https://'),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists chat_blocks (
  blocker uuid not null references profiles(id) on delete cascade,
  blocked uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create table if not exists chat_bans (
  user_id uuid primary key references profiles(id) on delete cascade,
  reason text,
  banned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references chat_messages(id) on delete set null,
  room_id uuid not null references chat_rooms(id) on delete cascade,
  reported_user uuid references profiles(id) on delete set null,
  reporter uuid references profiles(id) on delete set null,
  reason text check (reason is null or length(reason) <= 500),
  snapshot text,                           -- what the message said when it was reported
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  handled_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chat_reports_status_idx on chat_reports (status, created_at desc);

create table if not exists chat_calls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  caller_id uuid not null references profiles(id) on delete cascade,
  callee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing', 'active', 'ended', 'declined', 'missed', 'cancelled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index if not exists chat_calls_callee_idx on chat_calls (callee_id, created_at desc);

-- Private settings (e.g. TURN server login for voice calls). Only admins can read or write this table directly.
create table if not exists chat_config (key text primary key, value jsonb not null);

insert into site_settings(key, value) values
  ('chat_enabled', 'true'), ('chat_dm_policy', '"team"'), ('chat_images', 'true'), ('chat_calls', 'true')
on conflict do nothing;

-- ═════════ Helper functions (used by the security rules) ═════════
create or replace function chat_perm(p_user uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles ur join role_permissions rp on rp.role_id = ur.role_id join profiles p on p.id = ur.user_id
                 where ur.user_id = p_user and rp.permission_key = p_perm and p.is_active);
$$;

create or replace function chat_flag(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when value = 'true'::jsonb or value #>> '{}' = 'true' then true
                               when value = 'false'::jsonb or value #>> '{}' = 'false' then false end
                   from site_settings where key = p_key), p_default);
$$;

create or replace function is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_members m join chat_rooms r on r.id = m.room_id join profiles p on p.id = m.user_id
                 where m.room_id = p_room and m.user_id = auth.uid() and p.is_active
                   and (r.kind <> 'team' or chat_perm(auth.uid(), 'team.view')));
$$;

-- May these two people message each other? (policy set by admins: off / team members only / any member)
create or replace function chat_can_dm(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pol text;
begin
  if a is null or b is null or a = b then return false; end if;
  if not exists (select 1 from profiles where id = a and is_active) or not exists (select 1 from profiles where id = b and is_active) then return false; end if;
  if exists (select 1 from chat_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a)) then return false; end if;
  select value #>> '{}' into pol from site_settings where key = 'chat_dm_policy';
  pol := coalesce(pol, 'team');
  if pol = 'off' then return false; end if;
  if pol = 'anyone' then return true; end if;
  return chat_perm(a, 'team.view') and chat_perm(b, 'team.view');
end $$;

create or replace function chat_can_send(p_room uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); rk text; other uuid;
begin
  if me is null or not chat_flag('chat_enabled', true) then return false; end if;
  if exists (select 1 from chat_bans where user_id = me) then return false; end if;
  if not is_room_member(p_room) then return false; end if;
  select kind into rk from chat_rooms where id = p_room;
  if rk = 'direct' then
    select user_id into other from chat_members where room_id = p_room and user_id <> me limit 1;
    return chat_can_dm(me, other);
  end if;
  return true;
end $$;

create or replace function chat_msg_visible(p_msg uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_messages m where m.id = p_msg and is_room_member(m.room_id));
$$;

create or replace function chat_path_room(p_name text) returns uuid
language plpgsql immutable as $$
begin return (split_part(p_name, '/', 1))::uuid; exception when others then return null; end $$;

-- ═════════ Security rules ═════════
alter table chat_rooms enable row level security;
alter table chat_members enable row level security;
alter table chat_messages enable row level security;
alter table chat_reactions enable row level security;
alter table chat_stickers enable row level security;
alter table chat_blocks enable row level security;
alter table chat_bans enable row level security;
alter table chat_reports enable row level security;
alter table chat_calls enable row level security;
alter table chat_config enable row level security;

drop policy if exists "member read" on chat_rooms;
create policy "member read" on chat_rooms for select to authenticated using (is_room_member(id));
drop policy if exists "member read" on chat_members;
create policy "member read" on chat_members for select to authenticated using (is_room_member(room_id));

drop policy if exists "member read" on chat_messages;
drop policy if exists "send" on chat_messages;
create policy "member read" on chat_messages for select to authenticated using (is_room_member(room_id));
create policy "send" on chat_messages for insert to authenticated with check (
  sender_id = auth.uid() and kind in ('text', 'image', 'sticker') and chat_can_send(room_id)
  and (kind <> 'text' or length(trim(coalesce(body, ''))) > 0)
  and (kind <> 'image' or (chat_flag('chat_images', true) and image_path like room_id::text || '/%'))
  and (kind <> 'sticker' or sticker_url is not null or length(trim(coalesce(body, ''))) > 0));

drop policy if exists "member read" on chat_reactions;
drop policy if exists "react" on chat_reactions;
drop policy if exists "unreact" on chat_reactions;
create policy "member read" on chat_reactions for select to authenticated using (chat_msg_visible(message_id));
create policy "react" on chat_reactions for insert to authenticated with check (user_id = auth.uid() and chat_msg_visible(message_id));
create policy "unreact" on chat_reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read active" on chat_stickers;
drop policy if exists "manage" on chat_stickers;
create policy "read active" on chat_stickers for select to authenticated using (is_active or chat_perm(auth.uid(), 'chat.moderate') or has_permission('settings.manage'));
create policy "manage" on chat_stickers for all to authenticated using (chat_perm(auth.uid(), 'chat.moderate') or has_permission('settings.manage')) with check (chat_perm(auth.uid(), 'chat.moderate') or has_permission('settings.manage'));

drop policy if exists "own blocks" on chat_blocks;
create policy "own blocks" on chat_blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

drop policy if exists "moderators" on chat_bans;
create policy "moderators" on chat_bans for all to authenticated using (chat_perm(auth.uid(), 'chat.moderate')) with check (chat_perm(auth.uid(), 'chat.moderate'));

drop policy if exists "moderators" on chat_reports;
create policy "moderators" on chat_reports for all to authenticated using (chat_perm(auth.uid(), 'chat.moderate')) with check (chat_perm(auth.uid(), 'chat.moderate'));

drop policy if exists "parties read" on chat_calls;
create policy "parties read" on chat_calls for select to authenticated using (caller_id = auth.uid() or callee_id = auth.uid());

drop policy if exists "admins" on chat_config;
create policy "admins" on chat_config for all to authenticated using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

-- new message: bump the room, mark the sender as caught up
create or replace function chat_after_message() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update chat_rooms set last_message_at = new.created_at where id = new.room_id;
  if new.sender_id is not null then update chat_members set last_read_at = new.created_at where room_id = new.room_id and user_id = new.sender_id; end if;
  return null;
end $$;
drop trigger if exists chat_message_after on chat_messages;
create trigger chat_message_after after insert on chat_messages for each row execute function chat_after_message();

-- ═════════ Functions the app calls ═════════
create or replace function chat_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tid uuid; res jsonb;
begin
  if me is null or not chat_flag('chat_enabled', true) then return '[]'::jsonb; end if;
  if chat_perm(me, 'team.view') then
    select id into tid from chat_rooms where kind = 'team' limit 1;
    if tid is null then
      insert into chat_rooms(kind, title) values ('team', coalesce((select value #>> '{}' from site_settings where key = 'team_name'), 'Team') || ' team chat')
      on conflict do nothing returning id into tid;
      if tid is null then select id into tid from chat_rooms where kind = 'team' limit 1; end if;
    end if;
    insert into chat_members(room_id, user_id) values (tid, me) on conflict do nothing;
  end if;
  select coalesce(jsonb_agg(q.x order by q.x->>'last_message_at' desc), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'title', r.title, 'last_message_at', r.last_message_at, 'muted', m.muted,
      'unread', (select count(*) from chat_messages cm where cm.room_id = r.id and cm.created_at > m.last_read_at and cm.sender_id is distinct from me and cm.deleted_at is null),
      'last', (select jsonb_build_object('kind', cm.kind, 'body', left(coalesce(cm.body, ''), 80), 'sender_id', cm.sender_id, 'created_at', cm.created_at, 'deleted', cm.deleted_at is not null)
               from chat_messages cm where cm.room_id = r.id order by cm.created_at desc limit 1),
      'other', case when r.kind = 'direct' then (select jsonb_build_object('id', p.id, 'name', p.full_name, 'avatar', p.avatar_url)
                 from chat_members om join profiles p on p.id = om.user_id where om.room_id = r.id and om.user_id <> me limit 1) else null end
    ) as x
    from chat_members m join chat_rooms r on r.id = m.room_id
    where m.user_id = me and (r.kind <> 'team' or chat_perm(me, 'team.view'))
  ) q;
  return res;
end $$;

create or replace function chat_unread_total() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum((select count(*) from chat_messages cm where cm.room_id = m.room_id and cm.created_at > m.last_read_at and cm.sender_id is distinct from auth.uid() and cm.deleted_at is null)), 0)::int
  from chat_members m join chat_rooms r on r.id = m.room_id
  where m.user_id = auth.uid() and not m.muted and chat_flag('chat_enabled', true) and (r.kind <> 'team' or chat_perm(auth.uid(), 'team.view'));
$$;

create or replace function chat_open_direct(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; rid uuid;
begin
  if me is null or not chat_flag('chat_enabled', true) then raise exception 'Chat is not available right now'; end if;
  if not chat_can_dm(me, p_other) then raise exception 'You cannot message this person'; end if;
  k := case when me < p_other then me::text || ':' || p_other::text else p_other::text || ':' || me::text end;
  select id into rid from chat_rooms where direct_key = k;
  if rid is null then
    insert into chat_rooms(kind, direct_key, created_by) values ('direct', k, me) returning id into rid;
    insert into chat_members(room_id, user_id) values (rid, me), (rid, p_other);
  end if;
  return rid;
end $$;

-- People you are allowed to start a conversation with (searchable members only)
create or replace function chat_directory(p_q text default null) returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url from profiles p
  where auth.uid() is not null and p.id <> auth.uid() and p.is_active and p.show_in_search
    and (p_q is null or length(trim(p_q)) < 2 or p.full_name ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%')
    and chat_can_dm(auth.uid(), p.id)
  order by p.full_name limit 60;
$$;

create or replace function chat_room_people(p_room uuid) returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.full_name, p.avatar_url from profiles p
  where is_room_member(p_room)
    and (p.id in (select user_id from chat_members where room_id = p_room) or p.id in (select sender_id from chat_messages where room_id = p_room));
$$;

create or replace function chat_mark_read(p_room uuid) returns void
language sql security definer set search_path = public as $$
  update chat_members set last_read_at = now() where room_id = p_room and user_id = auth.uid();
$$;

create or replace function chat_delete_message(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update chat_messages set deleted_at = now(), body = null, image_path = null, sticker_url = null
  where id = p_id and deleted_at is null and (sender_id = auth.uid() or chat_perm(auth.uid(), 'chat.moderate'));
$$;

create or replace function chat_report(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m chat_messages;
begin
  select * into m from chat_messages where id = p_message;
  if not found or not is_room_member(m.room_id) then raise exception 'Message not found'; end if;
  insert into chat_reports(message_id, room_id, reported_user, reporter, reason, snapshot)
  values (m.id, m.room_id, m.sender_id, auth.uid(), left(p_reason, 500), case m.kind when 'image' then '[photo]' when 'sticker' then '[sticker]' else left(coalesce(m.body, ''), 500) end);
end $$;

-- Moderators see the conversation around a REPORTED message, nothing else
create or replace function chat_report_context(p_report uuid)
returns table (id uuid, created_at timestamptz, sender_id uuid, sender_name text, kind text, body text, image_path text, deleted boolean)
language plpgsql stable security definer set search_path = public as $$
declare rep chat_reports; ts timestamptz;
begin
  if not chat_perm(auth.uid(), 'chat.moderate') then raise exception 'Not allowed'; end if;
  select * into rep from chat_reports where chat_reports.id = p_report;
  if not found then return; end if;
  select cm.created_at into ts from chat_messages cm where cm.id = rep.message_id;
  ts := coalesce(ts, rep.created_at);
  return query
  select cm.id, cm.created_at, cm.sender_id, p.full_name, cm.kind, cm.body, cm.image_path, cm.deleted_at is not null
  from chat_messages cm left join profiles p on p.id = cm.sender_id
  where cm.room_id = rep.room_id and cm.created_at between ts - interval '1 day' and ts + interval '1 hour'
  order by cm.created_at limit 40;
end $$;

-- Voice calls: ringing → active → ended. The call audio itself goes directly between the two browsers (WebRTC).
create or replace function chat_start_call(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; cid uuid;
begin
  if not chat_flag('chat_calls', true) then raise exception 'Voice calls are switched off'; end if;
  if not chat_can_send(p_room) then raise exception 'You cannot call this person'; end if;
  select user_id into other from chat_members where room_id = p_room and user_id <> me limit 1;
  if other is null or not exists (select 1 from chat_rooms where id = p_room and kind = 'direct') then raise exception 'Calls are for one-to-one chats'; end if;
  update chat_calls set status = 'missed', ended_at = now() where status = 'ringing' and created_at < now() - interval '60 seconds';
  update chat_calls set status = 'ended', ended_at = now() where status = 'active' and created_at < now() - interval '4 hours';
  if exists (select 1 from chat_calls where status in ('ringing', 'active') and (caller_id in (me, other) or callee_id in (me, other))) then raise exception 'One of you is already on a call'; end if;
  insert into chat_calls(room_id, caller_id, callee_id) values (p_room, me, other) returning id into cid;
  return cid;
end $$;

create or replace function chat_answer_call(p_call uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update chat_calls set status = 'active', answered_at = now() where id = p_call and callee_id = auth.uid() and status = 'ringing' and created_at > now() - interval '90 seconds';
  if not found then raise exception 'This call is no longer ringing'; end if;
end $$;

create or replace function chat_end_call(p_call uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c chat_calls; me uuid := auth.uid();
begin
  select * into c from chat_calls where id = p_call and (caller_id = me or callee_id = me);
  if not found or c.status not in ('ringing', 'active') then return; end if;
  update chat_calls set ended_at = now(),
    status = case when c.status = 'active' then 'ended' when me = c.caller_id then 'cancelled' else 'declined' end
  where id = p_call;
end $$;

create or replace function chat_call_log() returns trigger language plpgsql security definer set search_path = public as $$
declare secs int; txt text;
begin
  if new.status in ('ended', 'declined', 'missed', 'cancelled') and old.status in ('ringing', 'active') then
    if new.status = 'ended' then
      secs := greatest(0, extract(epoch from (coalesce(new.ended_at, now()) - coalesce(new.answered_at, new.created_at)))::int);
      txt := 'Voice call · ' || (secs / 60)::text || ':' || lpad((secs % 60)::text, 2, '0');
    elsif new.status = 'declined' then txt := 'Call declined';
    else txt := 'Missed voice call'; end if;
    insert into chat_messages(room_id, sender_id, kind, body, call_id) values (new.room_id, new.caller_id, 'call', txt, new.id);
  end if;
  return null;
end $$;
drop trigger if exists chat_calls_log on chat_calls;
create trigger chat_calls_log after update of status on chat_calls for each row execute function chat_call_log();

-- Servers that help two phones/browsers find each other. Add a TURN server in Admin → Chat for calls across strict networks.
create or replace function chat_ice() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '[]'::jsonb
    else coalesce((select value from chat_config where key = 'ice_servers'), '[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]'::jsonb) end;
$$;

-- ═════════ Private photo storage ═════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "chat read" on storage.objects;
drop policy if exists "chat upload" on storage.objects;
create policy "chat read" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and (is_room_member(chat_path_room(name)) or chat_perm(auth.uid(), 'chat.moderate')));
create policy "chat upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and chat_flag('chat_images', true) and chat_can_send(chat_path_room(name)));

-- ═════════ Live updates ═════════
do $$ begin
  begin alter publication supabase_realtime add table chat_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table chat_calls; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table chat_reactions; exception when duplicate_object then null; end;
exception when undefined_object then null; end $$;

-- ═════════ Who may call what ═════════
do $$
declare f text;
begin
  foreach f in array array[
    'chat_perm(uuid,text)', 'chat_flag(text,boolean)', 'is_room_member(uuid)', 'chat_can_dm(uuid,uuid)', 'chat_can_send(uuid)', 'chat_msg_visible(uuid)', 'chat_path_room(text)',
    'chat_overview()', 'chat_unread_total()', 'chat_open_direct(uuid)', 'chat_directory(text)', 'chat_room_people(uuid)', 'chat_mark_read(uuid)', 'chat_delete_message(uuid)',
    'chat_report(uuid,text)', 'chat_report_context(uuid)', 'chat_start_call(uuid)', 'chat_answer_call(uuid)', 'chat_end_call(uuid)', 'chat_ice()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
