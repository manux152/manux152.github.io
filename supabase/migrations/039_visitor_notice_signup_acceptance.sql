-- Phase 39: terms acceptance at account creation + a short notice for visitors.
-- Safe to run more than once.

-- Which required documents this ACCOUNT has not accepted (current version, inside the re-accept period).
-- A visitor's quick "I agree" on a shared device does not count here: the account itself must have accepted.
create or replace function legal_needed_account() returns table(slug text, version int)
language sql security definer stable set search_path = public as $$
  select d.slug, d.version from legal_documents d
  where d.is_current and d.slug in ('terms', 'privacy')
    and not exists (
      select 1 from legal_acceptances a
      where a.document_slug = d.slug and a.document_version = d.version
        and auth.uid() is not null and a.user_id = auth.uid()
        and (setting_int('legal_reaccept_days', 90) = 0 or a.accepted_at > now() - make_interval(days => setting_int('legal_reaccept_days', 90))))
$$;
revoke all on function legal_needed_account() from public, anon;
grant execute on function legal_needed_account() to authenticated;

-- Used ONLY by the signup function (service role) to record the acceptance for the brand-new account.
create or replace function legal_accept_for(p_user uuid, p_device text, p_docs jsonb, p_platform text, p_ua text, p_locale text, p_ip text) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; d legal_documents;
begin
  if p_user is null then raise exception 'No user'; end if;
  if length(coalesce(p_device, '')) not between 8 and 64 then raise exception 'Invalid device'; end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) not between 1 and 2 then raise exception 'Invalid documents'; end if;
  for it in select * from jsonb_array_elements(p_docs) loop
    select * into d from legal_documents where slug = it->>'slug' and is_current and slug in ('terms', 'privacy');
    if not found or d.version <> (it->>'version')::int then raise exception 'outdated'; end if;
    insert into legal_acceptances(user_id, device_id, document_slug, document_version, content_hash, platform, user_agent, locale, ip_address)
    values (p_user, p_device, d.slug, d.version, encode(sha256(convert_to(d.sections::text, 'UTF8')), 'hex'),
            left(p_platform, 20), left(p_ua, 300), left(p_locale, 20), nullif(left(p_ip, 64), ''));
  end loop;
end $$;
revoke all on function legal_accept_for(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function legal_accept_for(uuid, text, jsonb, text, text, text, text) to service_role;
