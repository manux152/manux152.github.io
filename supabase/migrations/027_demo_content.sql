-- Super Strikers — DEMO CONTENT (news with images + upcoming matches). For testing only.
-- Safe to run more than once. Remove everything it adds with 027_remove_demo_content.sql before going to production.
-- Everything is tagged: matches use competition 'DEMO DATA', news slugs start with 'demo-'.
-- Images are random photos from picsum.photos (needs internet; swap for your own in Admin → News).

-- ───────── Opponents ─────────
insert into opponents(name) values
  ('Northside FC'), ('River Park United'), ('Cooper High Wolves'), ('Eastgate Rovers'), ('Lakeside Athletic')
on conflict (name) do nothing;

-- ───────── Upcoming matches ─────────
-- The first one kicks off in 12 minutes so you can watch the 10-minute countdown, auto kick-off and clock.
insert into matches(opponent_id, kickoff_at, venue, is_home, competition, status)
select o.id, v.kick, v.venue, v.home, 'DEMO DATA', 'scheduled'
from (values
  ('Northside FC',        now() + interval '12 minutes', 'Cooper High', true),
  ('River Park United',   now() + interval '3 days',     'River Park Fields', false),
  ('Cooper High Wolves',  now() + interval '10 days',    'Cooper High', true),
  ('Eastgate Rovers',     now() + interval '17 days',    'Eastgate Stadium', false),
  ('Lakeside Athletic',   now() + interval '24 days',    'Cooper High', true)
) as v(opp, kick, venue, home)
join opponents o on o.name = v.opp
where not exists (select 1 from matches m where m.opponent_id = o.id and m.competition = 'DEMO DATA');

-- ───────── News with cover images and galleries ─────────
insert into news_posts(title, slug, summary, body, cover_url, category, is_featured, published_at, gallery) values
 ('Super Strikers open the season with a statement win', 'demo-season-opener',
  'A late goal sealed a 1–0 victory in front of a big home crowd.',
  E'It was a night to remember at Cooper High. After a tight first half, the Strikers pushed forward and found the winner deep into stoppage time.\n\nCoach praised the defence for keeping a clean sheet and the fans for their noise from the first whistle to the last.',
  'https://picsum.photos/seed/strikers-opener/1200/675', 'Match report', true, now() - interval '1 day',
  '[{"url":"https://picsum.photos/seed/strikers-opener-1/1200/675","caption":"The winning goal"},{"url":"https://picsum.photos/seed/strikers-opener-2/1200/675","caption":"Celebrations at full time"}]'::jsonb),
 ('Meet your captain and vice-captain', 'demo-captains',
  'The armbands for the new season have been handed out.',
  E'Our captain will lead the team out wearing the C armband, with the vice-captain ready to step in. Both were chosen by the coaching staff for their attitude in training and leadership on the pitch.',
  'https://picsum.photos/seed/strikers-captains/1200/675', 'Club news', false, now() - interval '2 days', '[]'::jsonb),
 ('New home kit unveiled', 'demo-new-kit',
  'Green and gold return for the new season.',
  E'The new home kit is here, with a modern design and the club badge front and centre. Kits will be available in the shop from this weekend.',
  'https://picsum.photos/seed/strikers-kit/1200/675', 'Club news', false, now() - interval '3 days',
  '[{"url":"https://picsum.photos/seed/strikers-kit-1/1200/675","caption":"Home shirt"},{"url":"https://picsum.photos/seed/strikers-kit-2/1200/675","caption":"Training top"}]'::jsonb),
 ('Training schedule changes this week', 'demo-training-schedule',
  'Tuesday session moves indoors because of the weather.',
  E'Due to the forecast, Tuesday training moves to the indoor hall at the usual time. Bring indoor shoes and a water bottle. Thursday is unchanged.',
  'https://picsum.photos/seed/strikers-training/1200/675', 'Training', false, now() - interval '4 days', '[]'::jsonb),
 ('Tryouts open for next season', 'demo-tryouts',
  'Players of all levels are welcome to register.',
  E'We are opening tryouts for the new season. Register in the app, pick a session, and come ready to play. Parents and guardians can sign the consent forms online.',
  'https://picsum.photos/seed/strikers-tryouts/1200/675', 'Tryouts', false, now() - interval '5 days', '[]'::jsonb),
 ('Thank you to our sponsors', 'demo-sponsors',
  'Local businesses are backing the team again this year.',
  E'A huge thank you to everyone supporting the club this season. Your help pays for kit, pitches and travel, and keeps playing affordable for every family.',
  'https://picsum.photos/seed/strikers-sponsors/1200/675', 'Community', false, now() - interval '6 days', '[]'::jsonb)
on conflict (slug) do nothing;
