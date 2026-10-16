-- Super Strikers — Phase 15: tag players and members in photos, videos and news; "where is this person tagged?"
-- Safe to run more than once.

create table if not exists content_tags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('media', 'news')),
  target_id uuid not null,                              -- media_items.id or news_posts.id
  player_id uuid references players(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,   -- a member (account holder)
  tagged_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((player_id is not null)::int + (profile_id is not null)::int = 1)
);
create unique index if not exists content_tags_player_uq on content_tags (target_type, target_id, player_id) where player_id is not null;
create unique index if not exists content_tags_profile_uq on content_tags (target_type, target_id, profile_id) where profile_id is not null;
create index if not exists content_tags_target_idx on content_tags (target_type, target_id);
create index if not exists content_tags_player_idx on content_tags (player_id) where player_id is not null;
create index if not exists content_tags_profile_idx on content_tags (profile_id) where profile_id is not null;

alter table content_tags enable row level security;
drop policy if exists "staff read" on content_tags;
drop policy if exists "staff write" on content_tags;
-- The table itself is staff-only. Everyone else reads tags through the two functions below, which apply the privacy rules.
create policy "staff read" on content_tags for select using (has_permission('media.manage') or has_permission('news.manage'));
create policy "staff write" on content_tags for all
  using ((target_type = 'media' and has_permission('media.manage')) or (target_type = 'news' and has_permission('news.manage')))
  with check ((target_type = 'media' and has_permission('media.manage')) or (target_type = 'news' and has_permission('news.manage')));

-- Tags go away with the photo / article they belong to
create or replace function content_tags_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from content_tags where target_id = old.id and target_type = case tg_table_name when 'media_items' then 'media' else 'news' end;
  return null;
end $$;
drop trigger if exists media_items_tags_cleanup on media_items;
create trigger media_items_tags_cleanup after delete on media_items for each row execute function content_tags_cleanup();
drop trigger if exists news_posts_tags_cleanup on news_posts;
create trigger news_posts_tags_cleanup after delete on news_posts for each row execute function content_tags_cleanup();
-- Deleting an album removes its media rows, which removes their tags through the trigger above.

-- Who is tagged in these items? (only published content; members only if signed-in viewers may find them, like Search)
create or replace function content_tag_people(p_type text, p_ids uuid[])
returns table (target_id uuid, kind text, person_id uuid, name text, photo_url text)
language sql stable security definer set search_path = public as $$
  with vis as (
    select t.* from content_tags t
    where t.target_type = p_type and t.target_id = any(coalesce(p_ids, '{}'::uuid[])) and cardinality(coalesce(p_ids, '{}'::uuid[])) <= 200
      and ((p_type = 'news' and exists (select 1 from news_posts n where n.id = t.target_id and n.published_at is not null and n.published_at <= now()))
        or (p_type = 'media' and exists (select 1 from media_items m join albums a on a.id = m.album_id where m.id = t.target_id and a.is_published)))
  )
  select v.target_id, 'player'::text, pl.id, pl.full_name, pl.photo_url from vis v join players pl on pl.id = v.player_id where pl.is_active
  union all
  select v.target_id, 'member'::text, pr.id, pr.full_name, pr.avatar_url from vis v join profiles pr on pr.id = v.profile_id
   where auth.uid() is not null and pr.is_active and pr.show_in_search
  order by 4;
$$;
grant execute on function content_tag_people(text, uuid[]) to anon, authenticated;

-- Everywhere this person is tagged: news articles and photos/videos. Pass a player, a member, or both.
create or replace function person_appearances(p_player uuid default null, p_profile uuid default null)
returns table (kind text, item_id uuid, title text, sub text, image_url text, url text, slug text, album_id uuid, media_kind text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare pid uuid := p_player; prof uuid := p_profile; member_ok boolean := false;
begin
  if pid is not null and prof is null then select profile_id into prof from players where id = pid; end if;
  if prof is not null and pid is null then select id into pid from players where profile_id = prof and is_active limit 1; end if;
  if pid is not null and not exists (select 1 from players where id = pid and is_active) then pid := null; end if;
  member_ok := prof is not null and (pid is not null or exists (select 1 from profiles p where p.id = prof and p.is_active and p.show_in_search and auth.uid() is not null));
  if pid is null and not member_ok then return; end if;
  return query
  select * from (
    select distinct on (x.kind, x.item_id) x.* from (
      select 'news'::text as kind, n.id as item_id, n.title, n.category as sub, n.cover_url as image_url, null::text as url, n.slug, null::uuid as album_id, null::text as media_kind, n.published_at as created_at
        from content_tags t join news_posts n on n.id = t.target_id
       where t.target_type = 'news' and n.published_at is not null and n.published_at <= now()
         and ((pid is not null and t.player_id = pid) or (member_ok and t.profile_id = prof))
      union all
      select 'media', m.id, coalesce(nullif(m.caption, ''), a.title), a.title, case when m.kind = 'image' then m.url end, m.url, null, a.id, m.kind, m.created_at
        from content_tags t join media_items m on m.id = t.target_id join albums a on a.id = m.album_id
       where t.target_type = 'media' and a.is_published
         and ((pid is not null and t.player_id = pid) or (member_ok and t.profile_id = prof))
    ) x order by x.kind, x.item_id
  ) d order by d.created_at desc nulls last limit 200;
end $$;
grant execute on function person_appearances(uuid, uuid) to anon, authenticated;
