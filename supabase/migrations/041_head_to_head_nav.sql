-- Adds the Head-to-head page to the menu (it shows under "More"). Safe to run more than once.
insert into nav_items(label, route, sort_order)
select 'Head-to-head', '/head-to-head', coalesce((select max(sort_order) from nav_items), 0) + 1
where not exists (select 1 from nav_items where route = '/head-to-head');
