# Super Strikers — Phase 1 MVP

One Expo (React Native + Expo Router) codebase for **web, iOS and Android**, backed by Supabase.

## Setup
1. Create a Supabase project; run `supabase/migrations/001_phase1_schema.sql` in the SQL editor.
2. `cp .env.example .env` and fill in the project URL + anon key.
3. `npm install` then `npm run web` (or `npm run ios` / `npm run android`).
4. Open the app, tap **Sign in → Create account**. Then in the SQL editor run the commented
   "make yourself Admin" statement at the bottom of the migration.
5. Deploy the account-creation function: `supabase functions deploy create-user`.

## What's configurable from the Admin panel (nothing hardcoded)
Users & roles (custom roles with permission checklists), players, positions, coaches/managers,
opponents, matches & results, news, announcements, navigation labels/order/visibility, team name, colors, points rules.

## Notes
- Navigation labels/visibility/order come from the `nav_items` table; the five screens themselves are code.
- `npm run typecheck` to verify types. Phase 1 table = our own record; league table comes later.

## Phase 2 (stats, match events, media)
- Run `supabase/migrations/002_stats_events_media.sql` after 001, then `npm install` (new deps: expo-image-picker, base64-arraybuffer).
- Match score updates automatically from goal / opponent-goal events once a match has events.
- Event types, albums and media are all managed in Admin; photo uploads go to the public `media` storage bucket.

## Phase 3 (video uploads, player registration)
- Run `supabase/migrations/003_video_uploads_registration.sql`, then `npm install` (adds expo-video; removes base64-arraybuffer).
- Admin → Upload photos & videos now uploads real files (photos and videos, up to 50 MB each — the free Supabase plan limit;
  raise the bucket's `file_size_limit` on a paid plan). Uploaded videos play inside the app; external links still open in the browser.
- Players apply via **Join Super Strikers** on the Home screen. The form is built in Admin → Registration form.
  Admin → Player registrations approves or rejects; approval assigns the role named in the `registration_role` setting and creates the player profile.
- Turn registration on/off with the `registration_open` setting (Admin → Site settings).

## Phase 4 (push notifications)
1. Run `supabase/migrations/004_push_notifications.sql`, then `npm install`.
2. Deploy: `supabase functions deploy send-push`.
3. Supabase dashboard → Database → Webhooks → create one on table `notification_queue`, event **INSERT**, type Supabase Edge Functions → `send-push`
   (this is what delivers automatic alerts; admin-sent messages work without it).
4. Mobile push needs a real build, not plain Expo Go: `npx eas init` (put the project ID in `app.json → extra.eas.projectId`),
   then `eas build`. EAS walks you through Apple (APNs) and Google (FCM) credentials.
5. Users switch alerts on from **Account → Push notifications**.

Automatic alerts: news published (when a post gets a publish time that is now or earlier) and match finished (when status becomes "finished" —
enter events/score first, then mark finished). Wording and on/off live in Admin → Notification rules. Web browsers don't receive push in this phase.

## Phase 5 (match-day reminders, league tables & league APIs)
1. Run `supabase/migrations/005_reminders_leagues.sql`.
2. **Reminders:** enable the `pg_cron` extension (Dashboard → Database → Extensions), then in the SQL editor:
   `select cron.schedule('match-reminders', '*/15 * * * *', 'select queue_match_reminders()');`
   Reminders go out `match_reminder_hours` before kickoff (default 24; Admin → Site settings), formatted in the `timezone` setting
   (an IANA name such as `Africa/Kampala`). They reuse the Phase 4 `send-push` webhook. Wording: Admin → Notification rules.
3. **League tables:** Admin → League tables.
   - *Manual:* create a competition (source = Manual), open it, paste `Pos,Team,P,W,D,L,GF,GA,Pts` rows from a spreadsheet.
   - *From an API:* deploy `supabase functions deploy sync-standings`; store the key as a secret
     (`supabase secrets set LEAGUE_API_FOOTBALL_DATA=...`); create a competition (source = League API), choose a provider, and set the
     settings JSON, e.g. `{"league":"PL"}` plus the season. Open it and press **Sync now**. Schedule a daily sync via Dashboard → Integrations → Cron
     (Edge Function `sync-standings`, body `{"all":true}`).
   - *Any other API:* Admin → League API providers → add one with its URL, headers, the path to the standings list, and a field map.
     Secrets referenced in headers/URL must be named `LEAGUE_API_*`.
   - The primary competition shows as a mini table on Home; all visible ones appear on the Table tab, with your team highlighted.

## Phase 6 (predictions, calendar, awards, hardening, store-ready)
1. Run `supabase/migrations/006_predictions_calendar_awards_hardening.sql`, `npm install`.
2. Deploy: `supabase functions deploy predict-match` and `supabase functions deploy delete-account`.
3. **Predictions:** Admin → Matches → *Events & lineup* → *Generate prediction* for a scheduled match, or schedule `predict-match` daily with body `{"all":true}`
   (Dashboard → Integrations → Cron). Fans see a green (win) / blue (draw) / red (loss) bar on the match page and Home. Optional wording from Claude:
   `supabase secrets set ANTHROPIC_API_KEY=...`. Turn the feature off with the `predictions_enabled` setting.
4. **Calendar** (training, socials; weekly repeats; matches included), **Awards** (Player of the Month etc.), **Info & legal pages**: all under Admin.
5. The bottom bar shows `max_tabs` items (default 5) and puts the rest under **More** — change it in Admin → Site settings / Navigation.
6. **Security changes:** player date of birth/phone moved to a private table (Admin → Player private details); deactivated users lose all permissions;
   users can't reactivate themselves; built-in roles can't be deleted; sensitive changes are written to an audit log (Admin → Audit log);
   in-app account deletion added. **Performance:** database indexes, list limits, cached images (expo-image).
7. See `STORE_CHECKLIST.md` for website hosting and App Store / Google Play steps.

## Phase 7 (tryouts + restricted player sign-up)
1. Run `supabase/migrations/007_tryouts_team_codes.sql`; redeploy `create-user` (`supabase functions deploy create-user`).
2. **Set your team email domain:** Admin → Site settings → `allowed_email_domains`, e.g. `["superstrikers.com"]` (empty list = no domain rule).
   `signup_requires_code` (true by default) and `code_prefix` live there too.
3. **Team codes** (Admin → Team codes): generate single-use codes, optionally locked to one email, with a role and expiry. A code is consumed at sign-up
   (enforced in the database for every sign-up method) and can never be reused. Share it from the screen; the player taps Sign in → "I have a team code".
4. **Tryouts** (Admin → Tryouts): create a tryout, open **Applications**, set statuses, and press **Accept & generate team code** — the code is locked to the
   applicant's email; when they sign up their application becomes "joined". The application questions are editable (Admin → Tryout application form).
5. The very first account created becomes Admin and needs no code — create yours straight after setup, before sharing the app.
6. Admin-created accounts (Admin → Users) still work and are not affected by the code/domain rules.

## Phase 8 (customizable emails)
1. Run `supabase/migrations/008_emails.sql`.
2. Create a free account at **resend.com**, verify your sending domain/address, create an API key. Then:
   `supabase secrets set RESEND_API_KEY=re_...` and deploy `supabase functions deploy send-email`.
3. Dashboard → Database → Webhooks → new webhook on table `email_queue`, event INSERT → Supabase Edge Function `send-email` (sends the automatic emails).
4a. **Password-reset emails (use your template, always):** `supabase functions deploy password-reset --no-verify-jwt`. The Forgot-password button calls this function, which sends the *Password reset* template from Admin → Emails with your Email design (it needs `RESEND_API_KEY`, a sender address in Email design, and the public address in Admin → Website). Supabase's own reset email is no longer sent. Check Admin → Email log if one doesn't arrive.
4. **Sign-up / password-reset emails** (Supabase Auth): deploy `supabase functions deploy auth-email-hook --no-verify-jwt`, then Dashboard → Authentication → Hooks →
   *Send Email* → HTTPS → `https://<project-ref>.supabase.co/functions/v1/auth-email-hook`; generate the secret and run `supabase secrets set SEND_EMAIL_HOOK_SECRET="v1,whsec_..."`.
   Add your site URL and `superstrikers://reset-password` (plus your web `/reset-password` URL) under Authentication → URL Configuration → Redirect URLs.
   Also set the `site_url` setting (Admin → Site settings, e.g. `"https://yourclub.com"`) — it fills the `{app_url}` link in emails.
5. Open **Admin → Email design**: set the sender address, logo, colors, font, footer; press *Save & send me a test email*.
6. **Admin → Email templates**: edit subject/message/button for each email, turn automatic ones on/off, preview, and send a test.
7. **Manual sends**: Admin → Send an email (individual, by role, all members, or a tryout's applicants), or the *Send email* / *Email applicant* buttons on Users and Tryout applications.
8. Automatic emails: welcome (when the account's email is confirmed), confirm email, password reset, password-changed notice, tryout received / shortlisted / not selected,
   team code issued, registration approved / not approved. All greet the person by the name on their account (or tryout application).
9. Members can switch off *team emails* (bulk announcements) in Account; account emails are always sent. Every email is listed in Admin → Email log.

## Phase 9 (squad photos, coaches' area, availability, formations, search, shop)
1. Run `supabase/migrations/009_squad_coaches.sql` then `010_shop.sql`; `npm install`.
2. Deploy `supabase functions deploy formation-ai`, redeploy `send-email` (now sends team-wide emails as one batch). Optional: `supabase secrets set ANTHROPIC_API_KEY=...` for AI wording/reasoning.
3. **Player photos:** Account → *Edit my profile & photo* (photo, height, preferred foot, bio). Jersey number and position are set by coaches (Admin → Players). The Squad tab shows photo, name, jersey, position and height; tapping opens the player page.
4. **Coaches' area** (Admin → Coaches' area): upcoming matches with availability counts → *Lineup* (pick a formation, tap a spot, tap a player; ✅/❌ set availability on a player's behalf; publish to notify the team),
   *AI: recommend a formation* (uses available players, plus AI wording if a key is set), *Design a custom formation* (describe it or type e.g. 3-4-3), formation text, and training sessions (staff-only or team-visible).
5. **Availability:** players mark themselves available/unavailable on the match page or Home. Every change sends a push and one batch email to the whole team (respecting "Team emails" opt-out). Edit the wording in Notification rules / Email templates.
6. **Search** (🔍 in the header): players, staff, news, matches, teams, events, shop, media, tryouts, with filter buttons (type, position, news category, shop category, upcoming/results).
7. **Shop:** Admin → Shop categories / Shop products (*Photos & sizes* for uploads and size options) / Shop orders. Set `currency`, `shop_delivery_fee`, `shop_payment_instructions`, `shop_enabled` in Site settings.
   Checkout is done by a secure database function (prices and stock are checked on the server). **Payments are collected offline** (cash / mobile money / bank transfer) and you mark orders *paid*; customers are emailed at each status change.
   To take card/mobile-money payments online later, add a payment provider to `place_order`'s flow.
8. New permissions: `team.view`, `lineups.manage`, `training.manage`, `shop.manage`, `orders.manage` (given to the built-in roles; custom roles can be ticked in Admin → Roles).

## Phase 10 (online shop payments + training attendance)
1. Run `supabase/migrations/011_payments_attendance.sql`.
2. Deploy: `supabase functions deploy create-payment shop-payments` and `supabase functions deploy payment-webhook --no-verify-jwt`.
3. Set `site_url` (Admin → Site settings, e.g. `"https://yourclub.com"`, https only) — customers return to `<site_url>/pay-return`, so your website must be deployed (see STORE_CHECKLIST).
4. **Stripe:** create an account, then `supabase secrets set STRIPE_SECRET_KEY=sk_...`. In the Stripe dashboard add a webhook to the URL shown in *Admin → Payments → Connections* with the events listed at the top of `payment-webhook/index.ts`, then `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`.
   **Flutterwave** (cards + mobile money in many African countries): `supabase secrets set FLUTTERWAVE_SECRET_KEY=...`, add the webhook URL in its dashboard with a secret hash, then `supabase secrets set FLUTTERWAVE_SECRET_HASH=...`. This uses Flutterwave's v3 API — if your account is on their newer v4 API, the adapter in `_shared/pay.ts` needs adjusting.
5. **Admin → Payments:** shows whether each provider is connected, the webhook URLs, recent payments, Stripe refunds (Flutterwave refunds are done in its dashboard, then "Mark as refunded"), and anything needing attention. Turn methods on/off and edit checkout wording in *Payment methods*. Start with **test keys** and test orders.
6. Customers pick a payment method at checkout. Online orders hold their stock for `shop_payment_hold_minutes` (default 60); unpaid ones are then cancelled automatically if you schedule it: enable `pg_cron`, then
   `select cron.schedule('expire-unpaid-orders', '*/10 * * * *', 'select expire_unpaid_orders()');`
7. **Training attendance:** Admin → Training sessions → *Attendance* (mark Present / Late / Excused / Absent per player, or *Open check-in* for a 6-digit self check-in code), and Admin → Coaches' area → *Training attendance report* (30 / 90 days / all time, CSV). Players see their own summary under My profile.

## Phase 11 (website polish + season-end report)
1. Run `supabase/migrations/012_season_reports_website.sql`; deploy `supabase functions deploy sitemap --no-verify-jwt`.
2. **Admin → Website:** your public site address, the home-page banner (headline, sub-headline, picture, main button), contact details, social links and sponsor logos (shown in the website footer).
3. **Admin → Seasons:** define each season's start/end dates (a current season is created for you).
4. **Season report** (Admin → Season report): pick a season or custom dates — results, top scorers, assists, appearances, discipline, awards, **training attendance** and **shop sales** (best sellers, monthly revenue, unpaid/cancelled/refunded). Share a text summary, copy attendance / sales CSVs, or print / save as PDF on the web.
   Attendance and sales are private (need the `reports.view` permission, given to Admin and Manager). The public **Season review** page (Home and footer) shows only results, scorers, assists, appearances, discipline and awards.
5. **Website polish:** home banner, featured products and next-tryout strip on Home; footer with sponsors, social links, contact and legal pages; a top menu and 3–4 column grids on wide screens; page titles and descriptions for search engines; friendly 404 page; error screen; keyboard/screen-reader labels and hover states; share buttons on news and products; installable web app (PWA) metadata.
6. **Hosting:** `vercel.json`, `public/_redirects`, `public/_headers` include security headers and long caching. Replace `YOUR-PROJECT-REF` in the sitemap rule, add a `Sitemap:` line to `public/robots.txt`, then submit `/sitemap.xml` in Google Search Console.
   Limitation: pages are rendered in the browser, so Google reads titles/descriptions, but WhatsApp/Facebook link previews won't show per-page images.

## Phase 12 — branding, dashboard, themes & accessibility

Run once in the Supabase SQL Editor (new query): `supabase/migrations/013_branding_theme_dashboard.sql`
Then in the project folder: `npx expo install expo-image-manipulator` (enables rotate / flip / crop in the editors; everything else works without it).

- **Logo & footer** — Admin → *Logo & branding*: upload, rotate/flip/crop, size, backing, show/hide team name. Shown in the top bar and a redesigned footer (grouped quick links, contact, social pills, partners).
- **Hero slider** — Admin → *Hero slider*: up to 20 pictures, reorder, per-picture crop/rotate/flip, focus point, darkness, caption, alt text, link, timing, autoplay. Visitors get arrows, dots, swipe and a pause button.
- **Dashboard** — `/dashboard` (📊 in the header): next match/training, attendance, a "needs attention" list and shortcut tiles that appear only for the rights your role has.
- **Settings** — `/settings` (⚙️ in the header): light / dark / match device, text size, high contrast, reduce motion, underline links, and "show me in search results".
- **Profile photos in search** — members are searchable under *Members* (name + photo only, signed-in users only, opt-out in Settings).


## Phase 13 — AI news, pictures, inventory & colours, tactics board, navigation look, favicon

1. Run `supabase/migrations/014_news_inventory_tactics_nav.sql` (safe to re-run). Deploy: `supabase functions deploy news-ai`. Optional AI wording: `supabase secrets set ANTHROPIC_API_KEY=...` (without it, drafts are still built from your data in plain wording).
2. **News** (Admin → News): *Write with AI* lists story ideas built from your own data — match reports (with scorers/assists), match previews (form, head-to-head, prediction), awards, top scorers, league table, tryouts and new shop items — or a topic you type. Choose tone and length, press *Write this story*, then edit. The AI is told to use only the facts it is given. *Polish my text* rewrites your own wording. Add real pictures (upload, up to 12) or paste picture links (checked to be loadable), write captions, choose the cover, reorder; stories show a tap-to-enlarge gallery. Publish now, schedule, or keep as draft.
3. **Shop colours & stock:** Admin → Shop products → *Photos, colours & sizes* — tap a colour, add a size and stock, and give each colour its own picture (upload or link). Shoppers see a colour grid (one tap), sizes for that colour, a sold-out cross-out, and *See how it looks*. In the cart each line shows its colour — tap it to preview. Items at 0 stock can't be added, the cart blocks sold-out/over-quantity lines, and the database still refuses the order (stock is checked and reduced inside `place_order`). Blank stock = not tracked (always orderable) — give items a number to track them.
4. **Inventory** (Admin → Inventory): totals (sold out / low / not tracked / units), search + filters, per-item ± and typing, bulk *set / add / mark sold out* for the items shown, **Save** applies everything in one transaction (`bulk_update_stock`), bulk-create colour × size options per product, and a log of every stock change. Low-stock level: setting `shop_low_stock_threshold` (default 5).
5. **Tactics board** (Admin → Tactics board, also in Coaches' area): pick a shape, tap a spot then a player (profile photo + position badge appear), tap/drag to move or swap, *Auto-fill by position*, set style of play, defensive line, width, tempo, pressing, team instructions and per-player roles. The public **Formations** page shows the saved shape, tactics and "who plays where" read-only.
6. **Navigation:** new classic masthead on wide screens (logo + quick links, ruled menu row with an underline on the current page, *More* menu); phones get a logo bar with a ☰ menu sheet and a matching bottom bar. Admin → *Navigation look* sets the club default (6 themes, solid / gradient / pitch stripes / picture background, custom colour, picture darkness) with live preview; visitors can change theirs under Settings → Navigation or the *Appearance* button (turn off with "Let visitors change the look"). Gradient and stripes show on the web; phone apps show the solid colour.
7. **Favicon** (Admin → Favicon): upload a picture (auto-cropped to a square) or paste a link, preview at 16–128 px, crop/rotate, save. Changes the browser-tab icon. App-store and home-screen install icons still come from `assets/` and change with the next build.


## Phase 14 — promotions, spin wheel, fluid navigation, profile picture

1. Run `supabase/migrations/015_promotions_spin_wheel.sql` (safe to re-run). It replaces `place_order` with a version that takes an optional discount code and applies offers **on the server**.
2. **Promotions** (Admin → Promotions & discount codes): percent off, money off or free delivery; optional minimum spend, biggest discount, start/end, total uses. Leave the code empty for an **automatic** offer (applied to every qualifying order, best one wins) or add a code for customers to type. *Show in the banner* puts it in the strip above the menu (a live countdown appears in the last 3 days). In the cart shoppers get a code box, their won prizes, a “Add X more to unlock …” progress bar, and a clear discount line. Discounts are stored on the order (`discount`, `promo_code`) and shown in My orders and Admin → Orders.
3. **Sale prices:** on each product set *Old price to cross out*; the shop shows the old price struck through and a “−20%” badge.
4. **Spin wheel** (members spin at `/spin`; Admin → Spin wheel): add up to 12 segments, each with a prize (none / % off / money off / free delivery), minimum spend, validity days, colour and a **weight**. Chance = weight ÷ total weight; the screen shows each segment's chance and the overall win chance, and *Rescale prize weights* sets the overall chance (the starter wheel wins about 5% of spins). The draw runs on the server (`spin_wheel`), one spin per member per cooldown (daily … monthly), and a win creates a personal single-use code that expires after the validity days. The wheel always shows equal slices — odds are never visible to visitors.
5. **Navigation spacing** now follows the window size: side padding, link padding, text size, logo and profile-picture size scale with the screen, the number of menu links that fit is calculated from the available width (the rest go under *More*), and menus open right under the real header height.
6. **Profile picture** sits in the top-right corner of the header (tap for an account menu: account, edit photo, orders, spin, dashboard, settings, admin, sign out; *Sign in* when logged out) and at the top right of the Account page (tap to change it).

## Header & footer (Admin → Header & footer)
One page for the top and bottom of the site: header tagline and notice bar (with optional link), footer about text, copyright line, a banner picture and a background picture (upload or link, with a darkness setting), and your own footer links. It also links to the places that already existed: Logo & team name, Header colours & background picture, Favicon, Home page slider, Contact & social links, Sponsors & partner logos.

## Sort & filter (Admin panel and Dashboard)
Both hubs now have a search box plus **Sort** (Default, A → Z, Z → A, By group; the dashboard also has *Most waiting first*) and **Filter** (by group: My area, People, Matches & team, Content, Shop, Communication, Site design, Reports & logs; the dashboard also has *Only show things with work waiting*). A “Showing X of Y” line and a Clear button keep track. Groups are defined in `lib/adminCategories.ts`.

Both hubs now open **grouped**: collapsible sections (My area, People, Matches & team, Content, Shop, Communication, Site design, Reports & logs) with item counts and a Collapse all / Expand all link. Sorting A → Z / Z → A (or Most waiting first on the dashboard) switches to a flat list; filters and search still apply to the groups.

## Phase 15 — full-size pictures, grids with captions, and tagging
1. Run `supabase/migrations/016_tags.sql` (safe to re-run).
2. **Pictures are never cropped.** News, albums, album pages, players and article galleries show each picture whole, in its own proportions, in a grid with its headline / caption / details underneath. Tap a picture to open the full-screen viewer (full resolution, caption, album and date, who is tagged, previous / next, arrow keys and Esc on a computer). Videos show in the same grid with a play button (YouTube links use their thumbnail) and play in the viewer.
3. **News list** shows just the picture and headline (plus category and date); tap to read. The article shows the cover whole, a captioned picture grid and a “People in this story” row.
4. **Uploads keep the original quality**: media, news pictures, player/profile photos and product pictures are no longer recompressed, and profile photos are no longer forced square (round displays still crop visually).
5. **Tagging:** Admin → Photos & videos → *Tag people* on any photo or video; Admin → News → story editor → *Tag people* (with *Suggest from the text*, which finds player names in your writing). Players and searchable members can be tagged.
6. **Search a player or member → see where they are tagged.** Results show a “Where … is tagged” card with every news article (headline + picture) and photo / video, each opening the story or the picture. Player profiles have the same section, and members have a page at `/tagged/member/…`. Members only appear if they allow it (“show in search”), and only for signed-in visitors, exactly like member search.

## Phase 16 — Team assistant
1. Run `supabase/migrations/017_assistant.sql`, then deploy: `supabase functions deploy team-assistant`. For smart answers add `supabase secrets set ANTHROPIC_API_KEY=...` (optional `ANTHROPIC_MODEL`). Without a key the assistant still answers from your data using plain templates.
2. A floating 💬 button on every public page (and “Ask the assistant” in the menus) opens the chat at `/assistant`. It answers questions about **how to use the app** (built-in guides) and **what is happening at the club**: upcoming matches, results with scorers, friendly matches, games against one opponent, training, league table, events, tryouts, news, squad and player stats, top scorers, awards, shop (prices, colours and sizes in stock, sold-out items), running offers, club contact info, and — when signed in — the member's own orders, spin prizes and attendance. Answers include tap-to-open links (match, news article, player, product…).
3. **Privacy:** every lookup runs with the asker's own login, so database security decides what it can see — visitors get public information only; training is for signed-in team members; nobody can ask about other people's orders or details. Question text is never stored; only per-hour counts (kept 2 days) for the fair-use limit.
4. **Admin → Team assistant:** on/off, allow visitors, name, welcome message, time zone, hourly limit, suggested questions, and **club notes** (fees, rules, locations, FAQs) that it treats as official; plus a connection check that tells you whether AI is on.

### Assistant: quick-answer mode and deploying from the Supabase dashboard (no command line)
- If the `team-assistant` function is not deployed (or cannot be reached) the chat now still answers, in **quick-answer mode**: short summaries of matches, friendlies, training, events, news, squad, shop, offers and how-to guides, read straight from the database with the visitor's own login. A small note under the chat says when this mode is active. The code is a copy of the function's tool code in `lib/assistantLocal.ts`; keep the two in sync if you edit the tools.
- To turn on the smart (AI) assistant without the CLI: Supabase dashboard → **Edge Functions** → **Deploy a new function** → *Via Editor* → name it exactly `team-assistant` → paste the whole of `supabase/functions/team-assistant/index.ts` → **Deploy**. Then **Edge Functions → Secrets** → add `ANTHROPIC_API_KEY`. Check it under Admin → Team assistant → *Check the connection*. The same steps apply to `news-ai` (AI news drafts) and `formation-ai`.

### Edge function errors now explain themselves
Anywhere the app calls an Edge Function (create account, AI news, payments, push, email, standings sync…), the vague “Edge Function returned a non-2xx status code” is replaced by the function's own message, or a clear note such as “The ‘create-user’ function is not deployed in your Supabase project yet”. Functions used by the admin screens and where they live: `create-user` (Admin → Users → Create account), `news-ai`, `formation-ai`, `team-assistant`, `predict-match`, `sync-standings`, `send-email`, `send-push`, `shop-payments`, `create-payment`, `payment-webhook`, `delete-account`. Each is a folder in `supabase/functions/<name>/index.ts`; deploy from the Supabase dashboard (Edge Functions → Deploy a new function → Via Editor, same name, paste the code).

## Phase 17 — hero slider editing + video slides, and organised Albums
1. Run `supabase/migrations/018_hero_video.sql` (creates the `hero` storage bucket for videos, up to 50 MB — the free Supabase plan's per-file maximum).
2. **Hero slider (Admin → Hero slider)** now takes pictures **and videos** (upload a file, or paste a direct .mp4/.webm/.mov link). Every slide has a live preview of the banner and these edits, none of which touch your original file:
   - **Size & position:** *Fill the banner* (may crop) or *Show the whole picture*; zoom in and **zoom out** (50–300%); move up/down/left/right; rotate; flip; background colour (black, white, club colour or a blurred copy of the picture) for the space around a picture that doesn't fill the banner.
   - **Filters:** 10 presets (Vivid, Warm, Cool, Black & white, Sepia, Vintage, Faded, Dramatic, Soft glow) plus fine controls for brightness, contrast, colour strength, black & white, sepia, blur and colour shift.
   - **Pictures:** *Apply edits permanently* (web admin) bakes the edits into a new 16:9 picture, with *Restore original* to undo; the old *Crop to a new shape* tools are still there.
   - **Videos:** trim (start/end seconds, or press *Start here* / *End here* while previewing), speed (0.5×–2×), silent or “visitors can turn sound on”, repeat, and a cover picture shown while loading or for visitors who choose Reduce motion. The slideshow waits for a video to finish (or its end time) before moving on, unless it repeats.
   - Notes: trim, speed, zoom and filters are applied while playing — the video file is not re-encoded. Filters show on the website and on phone apps that use React Native's new architecture. YouTube links cannot play inside the banner; use a video file.
3. **Media → Albums:** the albums page has search, a filter (*All albums / Photos only / Videos only*) and sorting (newest, oldest, title A → Z / Z → A, most items); cards show photo and video counts. Inside an album, content is organised under a **Photos** heading and a **Videos** heading (each with its own subtitle and count); the same search, filter (*Photos only / Videos only*) and sort (newest, oldest, caption A → Z / Z → A) apply, and the full-screen viewer follows the order you see. Admin → Photos & videos has the same filter, sort and headings.

## Phase 18 — video links play inside the app
Pasted video links no longer send people to the original site. `lib/embed.ts` recognises **YouTube** (watch, youtu.be, Shorts, live), **Vimeo**, **Dailymotion**, **Facebook**, **TikTok**, **Instagram** (reels/posts), **Google Drive** and **Streamable** links, and direct video files (.mp4/.webm/.mov/.m3u8, from anywhere). Files play in the app's own player; the others play in an embedded player.
- **Albums / Photos & videos:** tap a video → it opens in the full-screen viewer and plays right there (YouTube uses the privacy-friendly youtube-nocookie player).
- **Hero slider:** the same links work as banner slides (muted, looping background video; a controls/sound option when you allow sound). Start/end can be set for YouTube links; trim and speed need a video file. Embedded videos can't report when they end, so the slideshow moves on after the usual time.
- **Websites:** works out of the box. **Phone apps:** run `npx expo install react-native-webview` (it is already listed in package.json) so embedded players can show; without it a phone shows the picture with a "Watch it now" button. Links from other sites still open the original page, and the admin screen tells you when that will happen.
- Some owners disable embedding for their videos (YouTube shows "Video unavailable"); those cannot play in any app.

## Phase 19 — Chat (messages, emojis, stickers, snapshots, voice calls)
1. Run `supabase/migrations/019_chat.sql` (safe to re-run). It creates the chat tables and security rules, a **private** `chat` storage bucket for photos, live-update publishing, and a `chat.moderate` permission given to the Admin and Super Admin roles.
2. **Messages** (💬 in the header, with an unread badge; also in the menus): an inbox with the **team chat** (everyone with team access) and **one-to-one chats**, a *New message* search, live updates, and unread counts.
3. **In a conversation:** text; **emoji picker** (4 groups); **stickers** (30 big-emoji stickers built in, plus picture stickers the club uploads); **snapshots** (take a photo with the camera) and **photos** from the library, sent to a private bucket and shown with short-lived links; **reactions** (👍 ❤️ 😂 🔥 👏 😮) and delete-my-message via tap or long-press on a message; **📞 voice call** button in one-to-one chats.
4. **Voice calls** are one-to-one WebRTC calls: ring, answer/decline, mute, hang up, call length and missed calls noted in the chat. They work **in web browsers** (both people need the web app open and a microphone). Calls connect directly between the two people; on strict networks add a relay (TURN) server in Admin → Chat. Phone apps do not make or answer calls yet (that needs an extra native package); they still see missed-call notes.
5. **Safeguarding (Admin → Chat):** choose who may send private messages — *no private messages*, *team members only* (default) or *any member*; switch photos and calls on or off; members can **report** a message or **block** a person; moderators can see only the conversation around a **reported** message, remove it, or **stop a person from chatting**. Banned people can still read but cannot send or call. Please read the in-screen note on young members and apply your club's safeguarding policy.
6. Not included yet: push notifications for new messages (badge and live updates only), group chats other than the team room, and read receipts / typing indicators.

## Phase 20 — Match day (live match centre, goal alerts, Man of the Match, AI match reports, share cards)
1. Run `supabase/migrations/020_match_day.sql` (safe to re-run). Then run `npx expo install --fix` (adds `react-native-view-shot`, `expo-sharing`; `html2canvas` is for web) and deploy the report function: `supabase functions deploy match-report`. For AI wording add `supabase secrets set ANTHROPIC_API_KEY=...` (optional `ANTHROPIC_MODEL`); without a key it writes a plain report from the match events.
2. **Live console (Admin → Matches → a match → *Go to live console*):** *Kick off*, *Half time*, *Start second half* and *Full time* buttons start the clock and change the match status for you; one-tap **Goal for us / Goal against us / Yellow / Red** with the player (and assist) picked from chips, minute filled in from the clock; **commentary** lines (comment, chance, substitution). Anything can be deleted from the feed or event list.
3. **Fans' match page:** while a match is live (and afterwards) they see a scoreboard with a running clock and the commentary feed. It updates instantly through Realtime, with a 30-second refresh as a safety net. The home page's “Next” card turns into **🔴 Live now · Follow live →**.
4. **Goal alerts:** a goal for or against during a live match adds a commentary line and queues a push (rule *Goal scored (live)*, editable under Notification rules). Red cards add a commentary line only. Events entered after full time stay quiet.
5. **Man of the Match:** after full time signed-in members vote for one player from the squad list (one vote each, changeable while open). Voting stays open for `motm_window_hours` (default 48) or until staff close it. Totals appear once you have voted, and for everyone when voting closes; nobody can see who voted for whom. **Admin → match → Match report & Man of the Match** closes the vote (top vote wins; a tie asks you to choose) or reopens it.
6. **Match report:** the same screen drafts a report from the match events (AI or plain wording, with tone choice and an optional note). It never saves by itself: read it, fix anything, then *Save report*; it shows on the match page.
7. **Share pictures:** the match page has a 4:5 card for **result**, **match day** or **starting XI** (club colour and logo from Branding). *Share picture* opens the phone's share sheet, the browser's share dialog, or downloads the PNG. If the image packages are missing it shares plain text instead.
8. Settings (Admin → Site settings): `live_updates_enabled`, `motm_enabled`, `motm_window_hours`.
9. Not included yet: substitutions on the pitch view, a live “fans' mood” poll, and push for half time / full time (full time already uses the existing *Match finished* rule).

## Phase 21 — Player development (ratings, coach notes, injuries & return to play, badges, form guide)
1. Run `supabase/migrations/021_player_development.sql` (safe to re-run). It adds a **`development.manage`** permission (given to the Admin, Manager and Coach roles) and the tables `player_ratings` and `player_injuries`, plus the functions `player_form` and `player_badges`. No new packages or functions to deploy.
2. **Rate a match (Admin → Matches → a finished match → Match report → *Rate the players*):** every player who played gets a 1–10 rating and an optional note; each entry has **Player can read this** (off by default). Each coach has their own rating per player per match, and saving again updates it.
3. **Admin → Player development:** squad overview showing who is out or on limited training (with expected return) and each player's average of their last 5 ratings. Tap a player for:
   - **Injuries & return to play:** add a brief description, status (*Out*, *Limited training*, *Cleared*), expected return date and return-to-play steps; change the status with one tap (clearing stamps the date).
   - **Ratings & notes:** full history, general notes (not tied to a match), the average, per-entry sharing switch, delete.
4. **Players' own page (Dashboard → *My development*, shown to players with a linked account):** their current injury status and return plan, badges, form guide, and **only the feedback coaches shared with them**.
5. **Public player pages** gain a **form guide** (last 10 matches: W/D/L, goals and assists per match, Man of the Match stars) and **badges**. Both come only from results and events that were already public.
6. **Badges are worked out automatically, never typed in:** first goal, 5/10/25 goals, hat-trick, 5/10 assists, 10/25/50 appearances, Man of the Match. *Training* badges (10/25 sessions) use attendance, which is private, so they are shown only to staff and to the player themselves.
7. **Privacy and safeguarding:** ratings, notes and injuries are not public, other players cannot see them, and injury records are deliberately kept out of the audit log. A player can read their own injury record and shared feedback only. If your players are under 18, decide with your club welfare officer who may see this, and who tells parents or guardians (parent accounts arrive in Phase 23). This is a tracker, not medical advice.
8. Not included yet: showing injured players as unavailable inside the lineup builder, reminders to coaches to rate after a match, and training-session ratings.

## Phase 22 — Fans (polls, news comments, Predict the score, invite-a-friend rewards)
1. Run `supabase/migrations/022_fans.sql` (safe to re-run). No new packages and no functions to deploy. It adds a **`comments.moderate`** permission (Admin, Super Admin and Manager roles) and these site settings: `comments_mode` (`open`, `approval`, `off`), `polls_enabled`, `fan_predictions_enabled`, `referral_enabled` and the referral reward settings.
2. **Polls (Admin → Polls):** a question with 2–6 answers, shown on the **home page**, under a **match** (this is the “fans' mood” poll for match day) or under a **news story**. Choose when it closes and when fans see results (*after they vote*, *always*, *when closed*). Signed-in members get one vote, changeable while open. Nobody can see who voted for what.
3. **News comments:** signed-in members comment under stories. Names appear as **first name + last initial** with their photo. Safeguards: no links, 500 characters, 10 comments an hour per person, duplicate posts refused, **Report** on every comment (three different reporters hide it until a moderator looks), and a per-story switch in the news editor. **Admin → Comments** shows *Waiting*, *Reported*, *Hidden* and *Recent*; moderators can approve, hide, delete or stop a person commenting. `comments_mode` **Approve first** holds every member's comment until a moderator approves it (recommended if your club has young members). Comment tables cannot be read directly; everything goes through checked functions.
4. **Predict the score:** on a match page (before kick-off) members pick the final score with +/− buttons and can change it until kick-off. **5 points** for the exact score, **2** for the right result. The **league** (`/predictor`, also a dashboard tile) has *All time* and *This month*, tie-breaks on exact scores, and your own row highlighted. After at least 5 picks, the match page also shows what fans are picking (never who picked what). Members can hide themselves from the league under **My profile → Show me on fan leaderboards**.
5. **Invite friends (`/invite`, dashboard tile):** each member has a personal code and share link (`/login?ref=CODE` opens sign-up with the code filled in). The sign-up form has an optional *Friend's invite code* box, and a member who forgot can add one within their first 14 days. The **friend's first paid shop order** (and at least `referral_min_order`, within `referral_window_days` of joining) earns the inviter a one-time **REF-XXXXXXXX** discount code (percent, amount or free delivery) that appears on their Invite page and works at checkout like spin prizes. Limits: one referral per person, no self-referrals, `referral_max_rewards` per member, codes expire.
6. **Admin → Referrals:** switch on/off, choose the reward, minimum order, code lifetime, order window and per-member limit; see who invited whom and mark a suspicious one **Don't count this one** before the friend orders. Rewards are not taken back if the friend's order is later refunded.
7. If sign-up needs a team code at your club (the default), a friend still needs one to create an account: the invite code is an extra, and the reward only needs the friend to place a paid order.
8. Security fix included: members can no longer edit their own `referral_code` or join date through their profile.
9. Not included yet: replies to comments, comment notifications, push when a poll opens, and a separate leaderboard for a single season.

## Phase 23 — Club operations (guardians, consent forms, fees, kit, sponsors, rotas)
1. Run `supabase/migrations/023_club_ops.sql` (safe to re-run). No new packages or functions. It adds four permissions, given to roles by name: **`families.manage`** (Admin, Manager), **`fees.manage`** (Admin, Manager), **`kit.manage`** (Admin, Manager, Coach) and **`rotas.manage`** (Admin, Manager, Coach). Sponsor reports use the existing `settings.manage`.
2. **Parents and guardians (Admin → Families):** tap *New link code* on a player (choose parent / guardian / carer first) and send it to the parent. In the app they open **My family**, enter the code (one use, valid 14 days, wrong guesses are limited to 10 an hour) and the child appears. Up to 4 guardians per player; staff can remove a link. Turn on **Needs a guardian** for players under 18 (we don't store dates of birth) so only a guardian can sign for them.
3. **What a guardian can see for their own child:** consent forms to sign, fees and receipts, kit, and (closing the Phase 21 gap) the child's injury status and the coach feedback marked “Player can read this”, through **My family → Form, badges, injuries and coach feedback**. Nobody else can see any of it.
4. **Consent forms (Admin → Consent forms):** write a form (photo permission, medical consent, travel, code of conduct…), choose *every player* or *players who need a guardian*, and mark it required or optional. Members read it, type the signer's full name and tick “I have read this and I agree”. The exact wording is stored with the signature, so editing a form later **raises its version and everyone signs again** while old signatures keep what was actually agreed. Signers can withdraw consent; staff see who has signed (**Who has signed?**) and **Families** shows each player's missing required forms. Have your club's welfare officer or insurer check the wording; the app records agreement, it does not give legal advice.
5. **Fees (Admin → Fees):** create plans (one-off, monthly, termly, yearly), **create invoices for the whole squad** for a due date (nobody gets two), record payments (cash, mobile money, bank, card, other, with an optional reference) and each payment gets a numbered receipt **R-000001…** that staff and families can share as text. Waive or cancel an invoice instead of deleting it. Totals show *overdue*, *due* and *paid this month*. Families see their invoices and your “How families pay” text. Fee records are visible only to staff with `fees.manage` and to that player's family. **Online card payment for fees is not in this phase**; payments are recorded by staff.
6. **Kit (Admin → Kit):** list what you own (optional stock), issue items with size, shirt number and a return-by date, see **Out now / Overdue / History**, mark returned. Families see what is issued to their child and when to return it.
7. **Sponsors:** each sponsor now has a **level** (headline first), optional **start and end dates** (they disappear automatically after the end date), and tick-boxes for the **website footer**, **home page** and **match pages**. **Admin → Sponsor report** shows views, clicks and click rate per sponsor and place for 7/30/90/365 days, a sharable summary to send the sponsor, and **private deal notes** (contact, value, notes) that are never public. Views count once per visit and counts are approximate.
8. **Rotas (Admin → Rotas; members: Volunteers & lifts):** create a volunteer or transport rota with slots and spaces. Members sign up or step back; others see first name and last initial only. For lifts, drivers say how many seats they can offer. **Only accept drivers who meet your club's safeguarding rules; the app does not vet drivers.**
9. Dashboard: **My family** shows how many things need attention (unsigned required forms, overdue fees, overdue kit); staff tiles appear for the new permissions.
10. Not included yet: online payment of fees, automatic fee reminders by push or email, a printed consent/receipt PDF, and linking a rota to a training session (rotas can mention a match in the notes).

## Phase 24 — Tech (match video clips, analytics, CSV export, languages, offline mode, install as an app)
1. Run `supabase/migrations/024_tech.sql` (safe to re-run). Then run `npx expo install --fix` (adds **`expo-file-system`**, used to save CSV files on phones). No new functions. New permission **`video.manage`** (Admin, Manager, Coach); new settings `analytics_enabled` and `default_language`; new column `profiles.language`.
2. **Match video clips (Admin → a match → *Match video: tag clips and highlights*):** add a recording by its link (YouTube, Vimeo, Facebook and others play inside the app). While you watch, start the **stopwatch** when you press play, tap *Use this time for the next tag*, choose what happened (goal, chance, save, tackle, assist, skill, card, mistake, other), optionally the player and a note, and save. Each clip starts 3 seconds before the time entered. **Match pages** get a *Highlights* card and **player pages** a *Clips* card: tap a moment to watch just that part (the player starts and stops at the tagged times for YouTube-style embeds). Clips are shown to fans by default; switch **Shown to fans** off for coaching clips (tagging a *mistake* defaults to staff-only). Hosted files or links that cannot be embedded open in the video's own page at that time. Only publish recordings you have the right to, and check your club's policy on filming and publishing images of young people.
3. **Analytics (Admin → Analytics):** page views, visits (one per person per day), new accounts and paid shop orders/sales for 7/30/90/365 days, with daily bars and the most viewed pages. Counting is **anonymous**: only a cleaned page name (e.g. `/news/:id`) and a random code created when the app opens; no IP address, account or device details. Personal and staff pages (profile, orders, family, chat, admin, checkout…) are never counted, browsers that send *Do Not Track* are skipped, and members can switch counting off under **Settings → Share anonymous usage statistics**. Switch it off for everyone with the `analytics_enabled` site setting. Old rows are deleted after 400 days. Counts are a guide: automated visits can add to them.
4. **Export data (Admin → Export data):** CSV spreadsheets of players, match results, training attendance, shop orders, fees and receipts, signed consent forms and kit. Each list appears only if you have its permission, files open correctly in Excel (accents included) and cells that could run as formulas are neutralised. **Every export is written to the audit log** (who, which list, how many rows, never the data). On the web the file downloads; on a phone the share sheet opens. Exports hold personal information, so treat the files carefully.
5. **Languages:** English, Français, Español, Português and Kiswahili. Choose under **Settings → Language** (saved on the device and on the account so it follows the member). Order of choice: the member's pick → their account → their phone or browser language → the club's `default_language` setting → English. Menus, buttons, headings and the member-facing screens from this project are translated; **news, pages, announcements, product names and anything staff type stay as written**, and the staff admin screens stay in English. Dates use the chosen language. Translations live in `lib/i18nStrings.ts` as `[English, Français, Español, Português, Kiswahili]` rows and any phrase not listed shows in English; **have a native speaker review them before launch** and add rows for any club-specific phrases. Arabic and other right-to-left languages are not included yet.
6. **Offline mode:** the app keeps the last good copy of **public** information (fixtures and results, standings, news, announcements, squad, albums, shop products, lineups, awards, tryouts, video clips, polls) on the device and shows it when there is no signal, with a yellow bar saying so. Only those tables are ever saved; orders, fees, forms, injuries, messages and profiles are never written to the device by this feature, saved copies are deleted when someone signs out, and they expire after 14 days. Actions that need the server (voting, signing, buying, posting) still need a connection, and nothing is queued to send later.
7. **Install as an app (web):** the site now has a manifest (`public/manifest.webmanifest`, edit the name and colours there) and a service worker (`public/sw.js`). Visitors can use *Add to Home Screen* / *Install*, and after one visit the site opens with no signal. The service worker only handles files from your own website (never Supabase, payments or video), fetches new pages from the network first, and is not registered on `localhost`. After a big redesign, change `VERSION` in `sw.js` to clear what browsers saved. Icons are made from `assets/icon.png`; replace `public/icon-192.png` and `public/icon-512.png` to change them. Deployment headers for both files are in `vercel.json` and `public/_headers`.
8. Not included yet: queued offline actions (such as saving an RSVP with no signal), Arabic/RTL, translating club-written content, automatic highlight reels that play clip after clip, and reading the live position from the video player (the stopwatch is used instead).

## Languages (English · Español · Kiswahili · Français · Português)
Everything follows the language picked in Settings: screens, admin pages, page titles, pop-ups and AI answers.
1. Run `supabase/migrations/025_i18n.sql` in the SQL Editor.
2. Deploy `translate-text` (turn **off** "Verify JWT" so visitors can use it) and redeploy `team-assistant`, `news-ai`, `match-report`, `formation-ai`, `predict-match` (they now share `_shared/lang.ts`).
3. `ANTHROPIC_API_KEY` must be set as a secret. Each phrase is translated once, then saved for everyone; text typed by people in chat is never translated.
To improve a translation: edit `lib/i18nStrings.ts` (wins over automatic ones) or `delete from ui_translations where lang = 'es';`.

## Phase 30 (search visibility + ads, all from Admin)
1. Run `supabase/migrations/029_seo_ads.sql`.
2. Deploy: `supabase functions deploy sitemap --no-verify-jwt` and `supabase functions deploy robots --no-verify-jwt`.
3. In `vercel.json` and `public/_redirects` replace `YOUR-PROJECT-REF` (sitemap + robots rewrites). The old static `public/robots.txt` was removed; `/robots.txt` is now generated and always lists your sitemap.
4. Admin → **Search visibility (SEO)**: set the website address, description, share picture, town, then follow the Google Search Console steps (verification code + submit `/sitemap.xml`).
5. Admin → **Ads**: add adverts, choose where they show (home, news, match, shop, footer), schedule them, set how often and an optional view limit. Admin → **Ad report** shows views and clicks. For a *push* announcement use Admin → Send notifications.
Every page now sends a canonical link, social preview card and structured data (team, website search, news articles). Private pages are `noindex`.

## Phase 31 (legal acceptance + cookie consent)
1. Run `supabase/migrations/030_legal_consent.sql` BEFORE deploying the new app (it also installs starting Terms, Privacy and Cookie texts).
2. Admin → **Legal documents**: set the contact email, read through the template and publish your own reviewed version.
3. Every new visitor and every new version: the Terms and Privacy Policy must be opened section by section and ticked before the app is usable. Acceptance is stored in `legal_acceptances` (version, text fingerprint, time, device, signed-in account).
4. Cookie choices appear on every visit (Strictly necessary always on; Preferences, Analytics, Marketing optional) and are logged in `cookie_consents`. Analytics, ad/sponsor counting and remembered language/theme only run when allowed. "Cookie settings" is in the footer and Settings.
5. Admin → **Acceptance & consent records**: view and export the evidence (read-only, cannot be edited).
Search-engine crawlers are not shown the gate, so public pages stay indexable. To ask for cookie choices only once instead of every visit, set `consent_every_visit` to false in `site_settings`.
