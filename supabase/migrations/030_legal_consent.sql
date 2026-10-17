-- Phase 31: Terms / Privacy / Cookie policy in sections, mandatory acceptance, cookie consent, and tamper-proof evidence records.
-- Safe to run more than once.

create table if not exists legal_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug in ('terms', 'privacy', 'cookies')),
  version int not null check (version > 0),
  title text not null check (length(title) <= 120),
  summary text check (summary is null or length(summary) <= 400),
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 40),
  is_current boolean not null default false,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  unique (slug, version)
);
create unique index if not exists legal_documents_one_current on legal_documents(slug) where is_current;
alter table legal_documents enable row level security;
drop policy if exists "public read" on legal_documents;
create policy "public read" on legal_documents for select using (true);
-- no insert/update/delete policies: documents change only through legal_publish(), so published versions are never edited.

create table if not exists legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  device_id text not null check (length(device_id) between 8 and 64),
  document_slug text not null check (document_slug in ('terms', 'privacy')),
  document_version int not null,
  content_hash text not null,                 -- fingerprint of the exact text shown, proves what was accepted
  accepted_at timestamptz not null default now(),
  platform text, user_agent text, locale text, ip_address text
);
create unique index if not exists legal_acceptances_once on legal_acceptances(device_id, document_slug, document_version, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists legal_acceptances_user on legal_acceptances(user_id, accepted_at desc);
alter table legal_acceptances enable row level security;
drop policy if exists "staff read" on legal_acceptances;
drop policy if exists "own read" on legal_acceptances;
create policy "staff read" on legal_acceptances for select using (has_permission('settings.manage'));
create policy "own read" on legal_acceptances for select using (user_id = auth.uid());

create table if not exists cookie_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  device_id text not null check (length(device_id) between 8 and 64),
  action text not null check (action in ('accept_all', 'reject_non_essential', 'custom')),
  necessary boolean not null default true,
  preferences boolean not null, analytics boolean not null, marketing boolean not null,
  policy_version int,
  created_at timestamptz not null default now(),
  platform text, user_agent text, locale text, ip_address text
);
create index if not exists cookie_consents_device on cookie_consents(device_id, created_at desc);
create index if not exists cookie_consents_when on cookie_consents(created_at desc);
alter table cookie_consents enable row level security;
drop policy if exists "staff read" on cookie_consents;
drop policy if exists "own read" on cookie_consents;
create policy "staff read" on cookie_consents for select using (has_permission('settings.manage'));
create policy "own read" on cookie_consents for select using (user_id = auth.uid());

-- Evidence cannot be changed or deleted. (The only allowed change is clearing user_id when an account is deleted.)
create or replace function evidence_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'user_id') is not distinct from (to_jsonb(old) - 'user_id') and new.user_id is null then return new; end if;
  raise exception 'Evidence records cannot be changed or deleted';
end $$;
drop trigger if exists legal_acceptances_immutable on legal_acceptances;
create trigger legal_acceptances_immutable before update or delete on legal_acceptances for each row execute function evidence_immutable();
drop trigger if exists cookie_consents_immutable on cookie_consents;
create trigger cookie_consents_immutable before update or delete on cookie_consents for each row execute function evidence_immutable();

create or replace function request_ip() returns text language plpgsql stable as $$
declare h text;
begin
  h := current_setting('request.headers', true);
  return nullif(left(trim(split_part(coalesce((h::json)->>'x-forwarded-for', ''), ',', 1)), 64), '');
exception when others then return null;
end $$;

-- Which required documents (terms + privacy) this device or signed-in account has not yet accepted at their current version.
create or replace function legal_needed(p_device text) returns table(slug text, version int)
language sql security definer stable set search_path = public as $$
  select d.slug, d.version from legal_documents d
  where d.is_current and d.slug in ('terms', 'privacy')
    and not exists (
      select 1 from legal_acceptances a
      where a.document_slug = d.slug and a.document_version = d.version
        and ((auth.uid() is not null and a.user_id = auth.uid()) or (length(coalesce(p_device, '')) >= 8 and a.device_id = p_device)))
$$;
grant execute on function legal_needed(text) to anon, authenticated;

-- Records acceptance of exactly the versions the person was shown. The server checks they are still the current versions.
create or replace function legal_accept(p_device text, p_docs jsonb, p_platform text, p_ua text, p_locale text) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; d legal_documents;
begin
  if length(coalesce(p_device, '')) not between 8 and 64 then raise exception 'Invalid device'; end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) not between 1 and 2 then raise exception 'Invalid documents'; end if;
  for it in select * from jsonb_array_elements(p_docs) loop
    select * into d from legal_documents where slug = it->>'slug' and is_current and slug in ('terms', 'privacy');
    if not found or d.version <> (it->>'version')::int then raise exception 'outdated'; end if;
    insert into legal_acceptances(user_id, device_id, document_slug, document_version, content_hash, platform, user_agent, locale, ip_address)
    values (auth.uid(), p_device, d.slug, d.version, encode(sha256(convert_to(d.sections::text, 'UTF8')), 'hex'),
            left(p_platform, 20), left(p_ua, 300), left(p_locale, 20), request_ip())
    on conflict do nothing;
  end loop;
end $$;
grant execute on function legal_accept(text, jsonb, text, text, text) to anon, authenticated;

create or replace function consent_log(p_device text, p_action text, p_preferences boolean, p_analytics boolean, p_marketing boolean, p_platform text, p_ua text, p_locale text) returns void
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if length(coalesce(p_device, '')) not between 8 and 64 or p_action not in ('accept_all', 'reject_non_essential', 'custom') then return; end if;
  -- the same device repeating the same choice within 10 minutes is one record, not many
  if exists (select 1 from cookie_consents c where c.device_id = p_device and c.action = p_action and c.preferences = p_preferences
             and c.analytics = p_analytics and c.marketing = p_marketing and c.created_at > now() - interval '10 minutes') then return; end if;
  select version into v from legal_documents where slug = 'cookies' and is_current;
  insert into cookie_consents(user_id, device_id, action, preferences, analytics, marketing, policy_version, platform, user_agent, locale, ip_address)
  values (auth.uid(), p_device, p_action, p_preferences, p_analytics, p_marketing, v, left(p_platform, 20), left(p_ua, 300), left(p_locale, 20), request_ip());
end $$;
grant execute on function consent_log(text, text, boolean, boolean, boolean, text, text, text) to anon, authenticated;

-- Staff publish a NEW version (old versions stay on record). Everyone must then accept the new version of terms/privacy.
create or replace function legal_publish(p_slug text, p_title text, p_summary text, p_sections jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int; s jsonb;
begin
  if not has_permission('settings.manage') then raise exception 'No permission'; end if;
  if p_slug not in ('terms', 'privacy', 'cookies') then raise exception 'Unknown document'; end if;
  if coalesce(trim(p_title), '') = '' or length(p_title) > 120 then raise exception 'Title needed (max 120 characters)'; end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) not between 1 and 40 then raise exception 'Between 1 and 40 sections needed'; end if;
  for s in select * from jsonb_array_elements(p_sections) loop
    if coalesce(trim(s->>'heading'), '') = '' or length(s->>'heading') > 120 or coalesce(trim(s->>'body'), '') = '' or length(s->>'body') > 8000 then
      raise exception 'Every section needs a heading (max 120) and text (max 8000 characters)'; end if;
  end loop;
  select coalesce(max(version), 0) + 1 into v from legal_documents where slug = p_slug;
  update legal_documents set is_current = false where slug = p_slug and is_current;
  insert into legal_documents(slug, version, title, summary, sections, is_current, published_by) values (p_slug, v, trim(p_title), nullif(trim(p_summary), ''), p_sections, true, auth.uid());
  return v;
end $$;
grant execute on function legal_publish(text, text, text, jsonb) to authenticated;

insert into site_settings(key, value) values
  ('legal_contact_email', '""'), ('legal_gate_enabled', 'true'), ('consent_every_visit', 'true')
on conflict (key) do nothing;

-- Starting text (a professional template: have a lawyer review it, then publish your own version from Admin → Legal documents)

insert into legal_documents(slug, version, title, summary, sections, is_current) values
 ('terms', 1, 'Terms of Use', 'The rules for using the website and app, including accounts, children, purchases and conduct.', $j$[{"heading": "Who we are and these Terms", "body": "These Terms of Use (the Terms) govern your use of the {{team}} website and mobile app (together, the Service), operated by {{team}} (we, us, the club).\n\nBy accepting these Terms you confirm that you have read them and agree to be bound by them. If you do not agree, please do not use the Service.\n\nThese Terms should be read together with our Privacy Policy and Cookie Policy."}, {"heading": "Using the Service", "body": "You may use the Service for lawful purposes connected with the club: following news, fixtures and results, registering for activities, buying club products and communicating with the club.\n\nYou must not:\n- use the Service in any way that is unlawful, harmful or abusive;\n- attempt to gain unauthorised access to accounts, systems or data;\n- copy, scrape or resell content from the Service without our written permission;\n- upload viruses or interfere with how the Service works."}, {"heading": "Accounts and security", "body": "Some features need an account. You must give accurate information and keep it up to date.\n\nYou are responsible for keeping your password confidential and for all activity under your account. Tell us promptly at {{email}} if you think your account has been used without permission.\n\nWe may suspend or close accounts that breach these Terms or put other users at risk."}, {"heading": "Children, parents and guardians", "body": "Many of our members are children. A parent or legal guardian must register a child, give any consents we request on the child's behalf, and supervise the child's use of the Service.\n\nBy registering a child you confirm that you have parental responsibility for that child.\n\nWe do not knowingly collect personal information directly from children without the consent of a parent or guardian. If you believe a child has used the Service without permission, contact us at {{email}}."}, {"heading": "Club activities and safety", "body": "Information on the Service about trainings, trials, matches and events is provided in good faith and may change at short notice, for example because of weather or availability.\n\nParticipation in sport carries an inherent risk of injury. By registering for activities you confirm that you or the child you register are fit to take part and that you will follow the instructions of coaches and club officials.\n\nNothing in these Terms limits any responsibility we have under law for personal injury caused by our negligence."}, {"heading": "Purchases, payments and refunds", "body": "Prices for products, memberships, fees and events are shown on the Service and include taxes where required. Payments are processed by our payment providers; we do not store your full card details.\n\nAn order is accepted when we confirm it. If a product is unavailable or a price was shown in error we may cancel the order and refund you in full.\n\nRefunds and cancellation rights are described at the point of purchase and, where you are a consumer, include any rights you have by law. Contact {{email}} about any order or payment problem."}, {"heading": "Community content and conduct", "body": "Where the Service lets you post comments, votes, messages or other content, you must be respectful and keep it lawful.\n\nYou must not post content that is abusive, discriminatory, defamatory, sexual, misleading, or that infringes anyone's rights or privacy.\n\nYou keep ownership of your content, but you give us a free, non-exclusive licence to host, display and share it within the Service for club purposes. We may remove content and restrict accounts to keep the community safe."}, {"heading": "Photos and video", "body": "The club may take photos and video at training, matches and events and publish them on the Service and the club's official channels.\n\nWe only publish images of children in line with the consents given by their parent or guardian. You can withdraw or change media consent at any time by contacting {{email}}, and we will stop further use and remove images from our channels where reasonably possible."}, {"heading": "Intellectual property", "body": "The Service, including its design, text, logos, crests, photos and software, belongs to {{team}} or its licensors and is protected by intellectual property laws.\n\nYou may view and share content from the Service for personal, non-commercial purposes with appropriate credit. Any other use needs our written permission."}, {"heading": "Advertising, sponsors and links", "body": "The Service may show advertisements and sponsor messages, which are labelled. We do not endorse advertisers' products and are not responsible for them.\n\nThe Service may link to third-party websites. We do not control those sites and are not responsible for their content or privacy practices."}, {"heading": "Availability and our liability", "body": "We aim to keep the Service available and accurate, but it is provided as is and as available. We do not promise it will be uninterrupted or error free.\n\nTo the fullest extent permitted by law, we are not liable for indirect or consequential losses, or for losses that were not reasonably foreseeable. Nothing in these Terms excludes or limits liability that cannot be excluded by law, including for death or personal injury caused by negligence, or for fraud."}, {"heading": "Suspension and ending", "body": "You can stop using the Service and ask us to delete your account at any time by contacting {{email}}.\n\nWe may suspend or end your access if you breach these Terms or if we must do so by law. Sections that by their nature should continue (for example intellectual property and liability) survive ending."}, {"heading": "Changes to these Terms", "body": "We may update these Terms from time to time. When we make a material change we will publish a new version and ask you to review and accept it before you continue using the Service.\n\nThe version number and date at the top of this document show which version applies."}, {"heading": "Governing law and contact", "body": "These Terms are governed by the laws of the place where the club is based, and the courts of that place have jurisdiction, without affecting any mandatory consumer rights you have in your country of residence.\n\nQuestions about these Terms: {{email}}."}]$j$::jsonb, true),
 ('privacy', 1, 'Privacy Policy', 'What personal information we collect, why, who sees it and your rights.', $j$[{"heading": "Summary", "body": "This Privacy Policy explains what personal information {{team}} collects, why we collect it, who we share it with and the choices and rights you have.\n\nIn short: we collect only what we need to run the club and the Service; we do not sell personal information; we take extra care with information about children; and you can choose which optional cookies and similar technologies we use."}, {"heading": "Who is responsible", "body": "{{team}} is the controller of personal information collected through the Service.\n\nContact for privacy questions and requests: {{email}}."}, {"heading": "Information we collect", "body": "Depending on how you use the Service, we may collect:\n- Account details: name, email address, phone number, password (stored in protected form) and profile photo.\n- Membership and registration details: date of birth, team, playing information, emergency contacts, medical or dietary information you choose to give us for safety, and consents.\n- Information about children registered by a parent or guardian.\n- Orders and payments: items purchased, delivery details and payment status (card details are handled by our payment provider).\n- Content you create: comments, votes, predictions, messages and uploads.\n- Technical information: device type, app version, language, and anonymous page-view counts if you allow analytics.\n- Records of your choices: the date, time, version, device and approximate network address when you accept our Terms and Privacy Policy or set your cookie preferences."}, {"heading": "How and why we use information", "body": "We use personal information to:\n- provide and run your account, memberships, activities, communications and purchases (contract);\n- keep members safe, including safeguarding and emergency contact (legal obligation and vital or legitimate interests);\n- send service and club announcements (contract and legitimate interests), and marketing only where you have agreed (consent);\n- understand how the Service is used so we can improve it (consent, where required);\n- keep records that prove you accepted our Terms and your cookie choices (legal obligation and legitimate interests);\n- prevent fraud and misuse and protect our rights (legitimate interests).\n\nWhere we rely on consent you can withdraw it at any time without affecting earlier processing."}, {"heading": "Children's information", "body": "We handle children's information with additional care. A parent or guardian must register a child and give consent on the child's behalf. We collect only what is needed for the child's participation, safety and welfare.\n\nInformation about children, including development notes, medical information and injury records, is visible only to authorised club staff and the child's parent or guardian. It is never used for advertising.\n\nParents and guardians can ask to see, correct or delete their child's information at any time at {{email}}."}, {"heading": "Photos and video", "body": "We publish photos and video of members only in line with the consent given by the member or, for children, their parent or guardian. Names are not shown with images of children unless consent covers it.\n\nYou can withdraw consent at any time by contacting {{email}}."}, {"heading": "Cookies and similar technologies", "body": "We use cookies and similar technologies (such as local storage on your device) for four purposes: strictly necessary, preferences, analytics and marketing. Strictly necessary ones are always on. The others are used only if you allow them.\n\nWe ask for your choice each time you visit and you can change it at any time using Cookie settings. See our Cookie Policy for details."}, {"heading": "Advertising and sponsors", "body": "The Service may show labelled advertisements and sponsor messages chosen by the club. We count how many times each advertisement is shown or clicked in aggregate form, if you allow analytics.\n\nWe do not sell your personal information and we do not share your personal details with advertisers. If an advertiser asks to receive anything, it is limited to aggregate figures such as views and clicks."}, {"heading": "Who we share information with", "body": "We share personal information only where needed:\n- Service providers that act on our behalf, such as hosting and database providers, email and push notification services, and payment processors, under contracts that protect your information.\n- Club officials and coaches, to the extent needed for your or your child's participation.\n- Leagues, associations and insurers where required for registration, safeguarding or insurance.\n- Authorities, where the law requires or to protect safety.\n\nWe do not sell personal information."}, {"heading": "International transfers", "body": "Our providers may process information in countries other than your own. Where we transfer personal information internationally we use appropriate safeguards, such as contractual protections approved by regulators, where the law requires them."}, {"heading": "How long we keep information", "body": "We keep information only as long as needed for the purposes above. As a guide: account and membership data while your account is active and for a limited period afterwards; order records for the period required by tax and accounting law; safeguarding records as required by law and best practice; and acceptance and cookie-choice records for as long as needed to evidence compliance.\n\nWhen information is no longer needed we delete or anonymise it."}, {"heading": "How we protect information", "body": "We use technical and organisational measures to protect personal information, including encryption in transit, access controls, role-based staff permissions and audit records for sensitive actions.\n\nNo system is completely secure. If a breach affects you we will notify you and the relevant authorities as the law requires."}, {"heading": "Your rights", "body": "Depending on where you live, you may have the right to access your information, correct it, delete it, restrict or object to certain uses, receive a portable copy, withdraw consent, and complain to your data protection authority. Residents of some regions also have the right to know what is collected and to opt out of sale or sharing, which we do not do.\n\nTo use these rights contact {{email}}. We may need to verify your identity first, and we will respond within the time the law allows. We will not treat you unfairly for exercising your rights."}, {"heading": "Records of acceptance and cookie choices", "body": "To evidence that you reviewed and accepted our Terms and Privacy Policy, and the cookie choices you made, we keep a record that includes: the document and version, the date and time, a random device identifier, your account (if signed in), the type of device and app, your language, and the network address from which you connected.\n\nThese records are held securely, are visible only to authorised staff, and cannot be edited."}, {"heading": "Changes and contact", "body": "We may update this Privacy Policy. When we make a material change we will publish a new version and ask you to review and accept it.\n\nQuestions or complaints: {{email}}."}]$j$::jsonb, true),
 ('cookies', 1, 'Cookie Policy', 'Which cookies and similar technologies we use and how to control them.', $j$[{"heading": "What are cookies", "body": "Cookies are small files that a website stores on your device. We also use similar technologies, such as local storage in your browser or app, which work in a comparable way. In this policy we call all of these cookies."}, {"heading": "Strictly necessary", "body": "These keep the Service working and secure and cannot be switched off. They include keeping you signed in, remembering items in your cart, protecting against misuse, and remembering your cookie and legal choices.\n\nWe do not need your consent for these."}, {"heading": "Preferences", "body": "These remember choices that make the Service easier to use on your device, such as language, theme, text size and accessibility settings, and saved translations. If you switch them off, these choices are not remembered between visits."}, {"heading": "Analytics", "body": "These help us understand how the Service is used so we can improve it. We count page views in a way that does not identify you, and we count how many times advertisements and sponsor messages are shown and clicked. If you switch analytics off, none of this is recorded."}, {"heading": "Marketing", "body": "These would be used to show advertising and measure campaigns by third parties. At present the Service does not load third-party advertising cookies. If we add any in future, they will only run if you have switched marketing on."}, {"heading": "Managing your choices", "body": "We ask for your choice each time you visit. You can change it at any time using Cookie settings, which is available on every page footer and in Settings. Your browser also lets you block or delete cookies, but parts of the Service may then stop working.\n\nWe keep a record of your choices as described in our Privacy Policy."}, {"heading": "Contact", "body": "Questions about cookies: {{email}}."}]$j$::jsonb, true)
on conflict (slug, version) do nothing;
