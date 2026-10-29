-- 043: add "About us" to the main menu. Run once in the Supabase SQL Editor. Safe to run again: it never adds a second copy.
-- The link goes to the About us page (/about). Rename, reorder or hide it any time in Admin > Navigation.
insert into nav_items (label, route, sort_order, is_visible)
select 'About us', '/about', (select coalesce(max(sort_order), 0) + 1 from nav_items), true
where not exists (select 1 from nav_items where route = '/about');
