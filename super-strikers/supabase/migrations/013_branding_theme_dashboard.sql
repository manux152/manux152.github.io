-- Super Strikers — Phase 12: branding (logo + hero slider images), member search with profile photos, per-user privacy

-- 1) Public bucket for logo and hero slides; only people who can edit site settings may write to it
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 8388608, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "branding read" on storage.objects;
drop policy if exists "branding upload" on storage.objects;
drop policy if exists "branding update" on storage.objects;
drop policy if exists "branding delete" on storage.objects;
create policy "branding read"   on storage.objects for select using (bucket_id = 'branding');
create policy "branding upload" on storage.objects for insert to authenticated with check (bucket_id = 'branding' and has_permission('settings.manage'));
create policy "branding update" on storage.objects for update to authenticated using (bucket_id = 'branding' and has_permission('settings.manage'));
create policy "branding delete" on storage.objects for delete to authenticated using (bucket_id = 'branding' and has_permission('settings.manage'));

-- 2) Members can choose whether they appear in the app's search results (default: yes)
alter table profiles add column if not exists show_in_search boolean not null default true;

-- 3) Member search: signed-in users only, active accounts only, returns just name + photo
create or replace function search_members(p_q text)
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url
  from profiles p
  where auth.uid() is not null
    and p.is_active and p.show_in_search
    and length(trim(coalesce(p_q, ''))) >= 2
    and p.full_name ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%'
  order by p.full_name
  limit 15;
$$;
grant execute on function search_members(text) to authenticated;

-- 4) Hero slides, logo options and slider timing live in site_settings (edited in Admin → Hero slider / Logo)
insert into site_settings(key, value) values
  ('hero_slides', '[]'), ('hero_interval', '5'), ('hero_autoplay', 'true'),
  ('logo_size', '"md"'), ('logo_show_name', 'true'), ('logo_plate', '"auto"')
on conflict do nothing;
