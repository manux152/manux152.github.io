-- Super Strikers — Phase 17: video slides in the hero slider. Safe to run more than once.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hero', 'hero', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "hero read" on storage.objects;
drop policy if exists "hero upload" on storage.objects;
drop policy if exists "hero delete" on storage.objects;
create policy "hero read" on storage.objects for select using (bucket_id = 'hero');
create policy "hero upload" on storage.objects for insert to authenticated with check (bucket_id = 'hero' and has_permission('settings.manage'));
create policy "hero delete" on storage.objects for delete to authenticated using (bucket_id = 'hero' and has_permission('settings.manage'));
