-- Removes everything added by 027_demo_content.sql. Run this before production.
delete from news_posts where slug like 'demo-%';
delete from matches where competition = 'DEMO DATA';
delete from opponents where name in ('Northside FC', 'River Park United', 'Cooper High Wolves', 'Eastgate Rovers', 'Lakeside Athletic')
  and not exists (select 1 from matches m where m.opponent_id = opponents.id);
