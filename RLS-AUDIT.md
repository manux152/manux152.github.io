# Row-level security audit (from your migrations 001 to 038)

This is a read of the migration files, not of the live database. Section 4 has queries that check the live database, which is the authoritative answer.

## 1. Result
- 120 tables are created, and all 120 have row-level security (RLS) turned on. No table is exposed without RLS.
- 8 tables have RLS on but no policies. That means only server functions (service role) can read or write them, which is right for these:
  analytics_daily, analytics_visitors, assistant_usage, guardian_code_failures, login_codes, training_checkin_attempts, ui_translations, verified_sessions.
- `fans` and `newsletters` have a single policy that needs the `newsletters.manage` permission. Fan sign-ups, confirmations and unsubscribes go through the fan-join function only.

## 2. Tables anyone can read (policy: select, using true)
These are meant to be public pages. Check each one holds nothing you would not put on the website:
positions, staff (name, title, photo, bio only), opponents, matches, match_events, match_players, match_predictions, event_types, award_types, media_items, standings_rows, product_categories, product_images, seasons, seo_pages, legal_documents, site_settings.
- site_settings is public by design, because the site reads it before sign-in. Never store a secret there. Today's keys are all display or behaviour settings, with no passwords or API keys. The Turnstile site key added by migration 040 is meant to be public.
- Signed-in only (authenticated): permissions, roles, role_permissions.
- media_items has no privacy column, so check that albums set to "private" are hidden by the albums policy and that unpublished albums do not leak their items.

## 3. Functions that anonymous visitors can call
160 functions are SECURITY DEFINER (they run with elevated rights). The ones explicitly granted to anonymous visitors are:
ad_has_budget, ad_track, analytics_hit, block_inactive_accounts, check_cart_stock, comments_open_for, consent_log, content_tag_people, fan_pick_summary, legal_accept, legal_needed, matches_auto_tick, motm_tally, news_comments_for, order_payment_status, person_appearances, place_order, player_badges, poll_results, promo_quote, season_report_public, session_ok, setting_int, spin_config, sponsor_track.
- Fixed in migration 040: check_signup. Anyone could call it and test team codes and email domains without limit. Only the signup function can call it now.
- Postgres lets everyone call a function unless you revoke it, and 113 SECURITY DEFINER functions have no revoke in the migrations. Most are trigger functions (they cannot be called directly) or check auth.uid() or has_permission inside. I checked search_members, verify_login_code, chat_directory, my_family, family_attention, update_my_player_profile, review_registration, season_report_private and rotas_upcoming: each checks who is calling. Run query 3 below for the full live list.
- Spam-able logging endpoints (analytics_hit, ad_track, sponsor_track, consent_log, legal_accept) and place_order (guest orders) accept anonymous calls by design. They are low risk, but rate limits would be a sensible later step.

## 4. Check the live database (Supabase, then SQL Editor)
```sql
-- 1) Tables with RLS OFF (should return no rows)
select schemaname, tablename from pg_tables where schemaname = 'public' and not rowsecurity;

-- 2) Every policy: who can do what
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 3) Functions an anonymous visitor can run (trigger functions excluded)
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- 4) Storage buckets that are public
select id, public from storage.buckets order by 1;
```
Also open Supabase, then Advisors, then Security. It flags missing RLS and risky functions automatically.
