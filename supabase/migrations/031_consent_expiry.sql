-- Phase 32: remember cookie choices per device (ask again only after a quiet spell) and ask everyone to re-accept Terms + Privacy periodically.
-- Both periods are set in Admin → Legal documents. Safe to run more than once.

insert into site_settings(key, value) values ('consent_reask_days', '3'), ('legal_reaccept_days', '90')
on conflict (key) do nothing;

create or replace function setting_int(p_key text, p_default int) returns int
language plpgsql stable security definer set search_path = public as $$
declare v text; n int;
begin
  select value #>> '{}' into v from site_settings where key = p_key;
  if v is null then return p_default; end if;
  begin n := trim(v)::int; exception when others then return p_default; end;
  return greatest(0, least(n, 3650));
end $$;
grant execute on function setting_int(text, int) to anon, authenticated;

-- A renewal is a NEW evidence row for the same version, so the "once" rule becomes a lookup index instead.
drop index if exists legal_acceptances_once;
create index if not exists legal_acceptances_device on legal_acceptances(device_id, document_slug, accepted_at desc);

create or replace function legal_accept(p_device text, p_docs jsonb, p_platform text, p_ua text, p_locale text) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; d legal_documents; zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if length(coalesce(p_device, '')) not between 8 and 64 then raise exception 'Invalid device'; end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) not between 1 and 2 then raise exception 'Invalid documents'; end if;
  for it in select * from jsonb_array_elements(p_docs) loop
    select * into d from legal_documents where slug = it->>'slug' and is_current and slug in ('terms', 'privacy');
    if not found or d.version <> (it->>'version')::int then raise exception 'outdated'; end if;
    -- the same device and account confirming the same version twice within an hour is one record
    if not exists (select 1 from legal_acceptances a where a.device_id = p_device and a.document_slug = d.slug and a.document_version = d.version
                   and coalesce(a.user_id, zero) = coalesce(auth.uid(), zero) and a.accepted_at > now() - interval '1 hour') then
      insert into legal_acceptances(user_id, device_id, document_slug, document_version, content_hash, platform, user_agent, locale, ip_address)
      values (auth.uid(), p_device, d.slug, d.version, encode(sha256(convert_to(d.sections::text, 'UTF8')), 'hex'),
              left(p_platform, 20), left(p_ua, 300), left(p_locale, 20), request_ip());
    end if;
  end loop;
end $$;
grant execute on function legal_accept(text, jsonb, text, text, text) to anon, authenticated;

-- Required documents this device / account has not accepted at the current version WITHIN the re-accept period (0 = never expires).
create or replace function legal_needed(p_device text) returns table(slug text, version int)
language sql security definer stable set search_path = public as $$
  select d.slug, d.version from legal_documents d
  where d.is_current and d.slug in ('terms', 'privacy')
    and not exists (
      select 1 from legal_acceptances a
      where a.document_slug = d.slug and a.document_version = d.version
        and (setting_int('legal_reaccept_days', 90) = 0 or a.accepted_at > now() - make_interval(days => setting_int('legal_reaccept_days', 90)))
        and ((auth.uid() is not null and a.user_id = auth.uid()) or (length(coalesce(p_device, '')) >= 8 and a.device_id = p_device)))
$$;
grant execute on function legal_needed(text) to anon, authenticated;
