-- Super Strikers — Phase 11: seasons + season reports, sponsors, website settings

-- ═════════ SEASONS ═════════
create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
alter table seasons enable row level security;
create policy "public read" on seasons for select using (true);
create policy "manage" on seasons for all using (has_permission('settings.manage'));
insert into seasons(name, starts_on, ends_on, is_current)
values ('Season ' || extract(year from now())::int, date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true);

insert into permissions(key, description) values ('reports.view','View season reports (attendance and shop sales included)');
insert into role_permissions select r.id, 'reports.view' from roles r where r.name in ('Admin','Manager');

-- ═════════ REPORTS ═════════
-- Public part: results, scorers, assists, appearances, discipline, awards. No private data.
create or replace function season_report_public(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rec jsonb; scorers jsonb; assists jsonb; apps jsonb; disc jsonb; aw jsonb; best jsonb;
        pw int; pd int; pl int;
begin
  select coalesce((value #>> '{}')::int, 3) into pw from site_settings where key = 'points_win';
  select coalesce((value #>> '{}')::int, 1) into pd from site_settings where key = 'points_draw';
  select coalesce((value #>> '{}')::int, 0) into pl from site_settings where key = 'points_loss';
  select jsonb_build_object('played', count(*), 'won', count(*) filter (where goals_for > goals_against),
      'drawn', count(*) filter (where goals_for = goals_against), 'lost', count(*) filter (where goals_for < goals_against),
      'goals_for', coalesce(sum(goals_for),0), 'goals_against', coalesce(sum(goals_against),0),
      'points', coalesce(count(*) filter (where goals_for > goals_against),0) * coalesce(pw,3) + coalesce(count(*) filter (where goals_for = goals_against),0) * coalesce(pd,1)
                + coalesce(count(*) filter (where goals_for < goals_against),0) * coalesce(pl,0))
    into rec from matches where status = 'finished' and kickoff_at::date between p_from and p_to;
  select to_jsonb(b) into best from (select o.name as opponent, m.goals_for, m.goals_against, m.kickoff_at::date as date
      from matches m join opponents o on o.id = m.opponent_id
      where m.status = 'finished' and m.goals_for > m.goals_against and m.kickoff_at::date between p_from and p_to
      order by (m.goals_for - m.goals_against) desc, m.goals_for desc limit 1) b;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.goals desc, x.full_name), '[]') into scorers from (
    select p.id, p.full_name, p.photo_url, count(*) as goals
    from match_events e join event_types t on t.id = e.event_type_id and t.stat_key = 'goal'
      join matches m on m.id = e.match_id and m.kickoff_at::date between p_from and p_to
      join players p on p.id = e.player_id and p.is_active
    group by p.id order by count(*) desc, p.full_name limit 10) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.assists desc, x.full_name), '[]') into assists from (
    select p.id, p.full_name, p.photo_url, count(*) as assists
    from match_events e join event_types t on t.id = e.event_type_id and t.stat_key = 'goal'
      join matches m on m.id = e.match_id and m.kickoff_at::date between p_from and p_to
      join players p on p.id = e.related_player_id and p.is_active
    group by p.id order by count(*) desc, p.full_name limit 10) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.appearances desc, x.full_name), '[]') into apps from (
    select p.id, p.full_name, p.photo_url, count(*) as appearances
    from match_players mp join matches m on m.id = mp.match_id and m.status = 'finished' and m.kickoff_at::date between p_from and p_to
      join players p on p.id = mp.player_id and p.is_active
    group by p.id order by count(*) desc, p.full_name limit 10) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.yellow desc, x.red desc, x.full_name), '[]') into disc from (
    select p.id, p.full_name,
      count(*) filter (where t.stat_key = 'yellow_card') as yellow, count(*) filter (where t.stat_key = 'red_card') as red
    from match_events e join event_types t on t.id = e.event_type_id and t.stat_key in ('yellow_card','red_card')
      join matches m on m.id = e.match_id and m.kickoff_at::date between p_from and p_to
      join players p on p.id = e.player_id and p.is_active
    group by p.id order by count(*) desc, p.full_name limit 10) x;
  select coalesce(jsonb_agg(jsonb_build_object('award', t.label, 'period', a.period_label, 'player', p.full_name, 'photo', p.photo_url, 'player_id', p.id, 'date', a.awarded_on) order by a.awarded_on desc), '[]')
    into aw from awards a join award_types t on t.id = a.award_type_id left join players p on p.id = a.player_id
    where a.is_published and a.awarded_on between p_from and p_to;

  return jsonb_build_object('from', p_from, 'to', p_to, 'record', rec, 'best_win', best, 'scorers', scorers, 'assists', assists,
                            'appearances', apps, 'discipline', disc, 'awards', aw);
end $$;
grant execute on function season_report_public(date, date) to anon, authenticated;

-- Private part: training attendance and shop sales (needs reports.view)
create or replace function season_report_private(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sess int; att jsonb; shop jsonb; cur text;
begin
  if not has_permission('reports.view') then raise exception 'Forbidden'; end if;
  select count(*) into sess from training_sessions where session_date::date between p_from and p_to;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pct desc, x.full_name), '[]') into att from (
    select p.id, p.full_name, p.shirt_number,
      count(a.*) filter (where a.status = 'present') as present, count(a.*) filter (where a.status = 'late') as late,
      count(a.*) filter (where a.status = 'excused') as excused, count(a.*) filter (where a.status = 'absent') as absent,
      case when sess > 0 then round(100.0 * count(a.*) filter (where a.status in ('present','late')) / sess) else 0 end as pct
    from players p
    left join training_attendance a on a.player_id = p.id and a.session_id in (select id from training_sessions where session_date::date between p_from and p_to)
    where p.is_active group by p.id) x;

  select coalesce(value #>> '{}', 'USD') into cur from site_settings where key = 'currency';
  with paid as (
    select o.* from orders o where o.status <> 'cancelled' and o.payment_status = 'paid' and coalesce(o.paid_at, o.created_at)::date between p_from and p_to),
  items as (select oi.name, oi.quantity, oi.unit_price from order_items oi join paid on paid.id = oi.order_id)
  select jsonb_build_object(
    'currency', coalesce(cur, 'USD'),
    'orders', (select count(*) from paid),
    'revenue', coalesce((select sum(subtotal + delivery_fee) from paid), 0),
    'products_revenue', coalesce((select sum(subtotal) from paid), 0),
    'delivery_fees', coalesce((select sum(delivery_fee) from paid), 0),
    'units', coalesce((select sum(quantity) from items), 0),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'orders', c, 'revenue', r)), '[]')
                  from (select payment_method, count(*) as c, sum(subtotal + delivery_fee) as r from paid group by payment_method) m),
    'top_products', (select coalesce(jsonb_agg(t), '[]') from (select name, sum(quantity) as units, sum(quantity * unit_price) as revenue from items group by name order by sum(quantity * unit_price) desc limit 8) t),
    'monthly', (select coalesce(jsonb_agg(m order by m.month), '[]') from (select to_char(date_trunc('month', coalesce(paid_at, created_at)), 'YYYY-MM') as month, count(*) as orders, sum(subtotal + delivery_fee) as revenue from paid group by 1) m),
    'outstanding', coalesce((select sum(subtotal + delivery_fee) from orders where status <> 'cancelled' and payment_status in ('unpaid','pending') and created_at::date between p_from and p_to), 0),
    'cancelled', (select count(*) from orders where status = 'cancelled' and created_at::date between p_from and p_to),
    'refunded', (select count(*) from orders where payment_status = 'refunded' and created_at::date between p_from and p_to)
  ) into shop;

  return jsonb_build_object('sessions', sess, 'avg_attendance', coalesce((select round(avg((x->>'pct')::numeric)) from jsonb_array_elements(att) x), 0), 'attendance', att, 'shop', shop);
end $$;
grant execute on function season_report_private(date, date) to authenticated;

-- ═════════ SPONSORS + WEBSITE SETTINGS ═════════
create table sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true
);
alter table sponsors enable row level security;
create policy "public read" on sponsors for select using (is_active or has_permission('settings.manage'));
create policy "manage" on sponsors for all using (has_permission('settings.manage'));

insert into site_settings(key, value) values
  ('hero_title','""'), ('hero_subtitle','""'), ('hero_image_url','""'), ('hero_cta_label','""'), ('hero_cta_route','""'),
  ('contact_email','""'), ('contact_phone','""'), ('contact_address','""'), ('social_links','[]'), ('footer_text','""')
  on conflict do nothing;
insert into nav_items(label, route, sort_order) values ('Season review','/season-review',14);
