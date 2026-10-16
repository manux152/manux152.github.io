-- Super Strikers — Phase 13: news pictures + AI drafts, shop colours & inventory tracking, tactics board, navigation look, favicon
-- Safe to run more than once.

-- ═════════ 1) NEWS: pictures (uploaded files and/or picture links) + AI draft flag ═════════
alter table news_posts add column if not exists gallery jsonb not null default '[]';   -- [{ "url": "https://…", "caption": "…" }]
alter table news_posts add column if not exists ai_generated boolean not null default false;
alter table news_posts add column if not exists ai_source text;                         -- e.g. 'match_report:<match id>'
alter table news_posts drop constraint if exists news_gallery_is_array;
alter table news_posts add constraint news_gallery_is_array check (jsonb_typeof(gallery) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news', 'news', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "news read" on storage.objects;
drop policy if exists "news upload" on storage.objects;
drop policy if exists "news delete" on storage.objects;
create policy "news read"   on storage.objects for select using (bucket_id = 'news');
create policy "news upload" on storage.objects for insert to authenticated with check (bucket_id = 'news' and has_permission('news.manage'));
create policy "news delete" on storage.objects for delete to authenticated using (bucket_id = 'news' and has_permission('news.manage'));

-- ═════════ 2) SHOP: colours on options, picture per colour, inventory log, bulk stock updates ═════════
alter table product_variants add column if not exists color_name text;
alter table product_variants add column if not exists color_hex  text;
alter table product_variants add column if not exists size_label text;
alter table product_variants add column if not exists image_url  text;   -- picture of the item in this colour
alter table product_variants add column if not exists sku        text;
alter table product_variants drop constraint if exists product_variants_hex_ok;
alter table product_variants add constraint product_variants_hex_ok check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$');
alter table product_variants drop constraint if exists product_variants_image_ok;
alter table product_variants add constraint product_variants_image_ok check (image_url is null or image_url ~* '^https?://');

-- The option label is always "Colour / Size" when those are filled in (existing label-only options are untouched)
create or replace function variant_compose_label() returns trigger language plpgsql as $$
begin
  if nullif(trim(coalesce(new.color_name, '')), '') is not null or nullif(trim(coalesce(new.size_label, '')), '') is not null then
    new.label := concat_ws(' / ', nullif(trim(new.color_name), ''), nullif(trim(new.size_label), ''));
  end if;
  return new;
end $$;
drop trigger if exists variant_label on product_variants;
create trigger variant_label before insert or update of color_name, size_label on product_variants for each row execute function variant_compose_label();

-- Every stock change is recorded (who, how much, why)
create table if not exists inventory_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null,
  item_label text not null,
  delta int,                      -- null when the item switched to/from "unlimited"
  new_stock int,                  -- null = unlimited
  reason text not null default 'adjustment',
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_log_idx on inventory_log(created_at desc);
create index if not exists inventory_log_product_idx on inventory_log(product_id, created_at desc);
alter table inventory_log enable row level security;
drop policy if exists "staff read" on inventory_log;
create policy "staff read" on inventory_log for select using (has_permission('shop.manage') or has_permission('orders.manage'));

create or replace function log_stock_change() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; vid uuid; lbl text; why text; prev int := null; d int;
begin
  if tg_op = 'UPDATE' then
    if new.stock is not distinct from old.stock then return null; end if;
    prev := old.stock;
  end if;
  if tg_table_name = 'products' then pid := new.id; vid := null; lbl := new.name;
  else pid := new.product_id; vid := new.id; lbl := new.label; end if;
  why := coalesce(nullif(current_setting('app.stock_reason', true), ''),
                  case when tg_op = 'INSERT' then 'added' when has_permission('shop.manage') then 'adjustment' else 'order' end);
  d := case when tg_op = 'INSERT' or prev is null or new.stock is null then null else new.stock - prev end;
  insert into inventory_log(product_id, variant_id, item_label, delta, new_stock, reason, changed_by)
  values (pid, vid, lbl, d, new.stock, why, auth.uid());
  return null;
end $$;
drop trigger if exists variants_stock_log on product_variants;
create trigger variants_stock_log after insert or update of stock on product_variants for each row execute function log_stock_change();
drop trigger if exists products_stock_log on products;
create trigger products_stock_log after update of stock on products for each row execute function log_stock_change();

-- Bulk stock update in one transaction. changes = [{variant_id|product_id, stock, mode: 'set'|'add'}]
create or replace function bulk_update_stock(p_changes jsonb, p_reason text default 'bulk')
returns int language plpgsql security definer set search_path = public as $$
declare c jsonb; n int := 0; v int; m text; vid uuid; pid uuid; rc int;
begin
  if not has_permission('shop.manage') then raise exception 'Not allowed'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 500 then raise exception 'Invalid request'; end if;
  perform set_config('app.stock_reason', left(coalesce(nullif(p_reason, ''), 'bulk'), 30), true);
  for c in select * from jsonb_array_elements(p_changes) loop
    m := coalesce(c->>'mode', 'set');
    v := nullif(c->>'stock', '')::int;
    vid := nullif(c->>'variant_id', '')::uuid;
    pid := nullif(c->>'product_id', '')::uuid;
    if m not in ('set', 'add') then raise exception 'Invalid mode'; end if;
    if m = 'set' and v is not null and v < 0 then raise exception 'Stock cannot be negative'; end if;
    if m = 'add' and v is null then raise exception 'Enter how many to add'; end if;
    if vid is not null then
      if m = 'set' then update product_variants set stock = v where id = vid;
      else update product_variants set stock = greatest(0, coalesce(stock, 0) + v) where id = vid; end if;
    elsif pid is not null then
      if m = 'set' then update products set stock = v where id = pid;
      else update products set stock = greatest(0, coalesce(stock, 0) + v) where id = pid; end if;
    else
      raise exception 'Each change needs a product or option';
    end if;
    get diagnostics rc = row_count; n := n + rc;
  end loop;
  perform set_config('app.stock_reason', '', true);
  return n;
end $$;
revoke all on function bulk_update_stock(jsonb, text) from public, anon;
grant execute on function bulk_update_stock(jsonb, text) to authenticated;

-- Customers can ask which cart lines are available right now (read-only, no personal data)
create or replace function check_cart_stock(p_items jsonb)
returns table (product_id uuid, variant_id uuid, available int, tracked boolean, is_active boolean)
language sql stable security definer set search_path = public as $$
  select (it->>'product_id')::uuid, nullif(it->>'variant_id', '')::uuid,
         case when nullif(it->>'variant_id', '') is not null then coalesce(v.stock, 2147483647) else coalesce(p.stock, 2147483647) end,
         case when nullif(it->>'variant_id', '') is not null then v.stock is not null else p.stock is not null end,
         p.is_active and (nullif(it->>'variant_id', '') is null or coalesce(v.is_active, false))
  from jsonb_array_elements(p_items) it
  left join products p on p.id = (it->>'product_id')::uuid
  left join product_variants v on v.id = nullif(it->>'variant_id', '')::uuid
  where jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) <= 30;
$$;
grant execute on function check_cart_stock(jsonb) to anon, authenticated;

insert into site_settings(key, value) values ('shop_low_stock_threshold', '5') on conflict do nothing;

-- ═════════ 3) TACTICS BOARD: who plays where in each team shape + tactical style ═════════
alter table formations add column if not exists tactics jsonb not null default '{}';   -- { style, line, width, tempo, press, instructions }
create table if not exists formation_assignments (
  id uuid primary key default gen_random_uuid(),
  formation_id uuid not null references formations(id) on delete cascade,
  slot_key text not null,
  player_id uuid not null references players(id) on delete cascade,
  role_note text,
  unique (formation_id, slot_key),
  unique (formation_id, player_id)
);
create index if not exists formation_assignments_idx on formation_assignments(formation_id);
alter table formation_assignments enable row level security;
drop policy if exists "public read" on formation_assignments;
drop policy if exists "manage" on formation_assignments;
create policy "public read" on formation_assignments for select using (
  exists (select 1 from formations f where f.id = formation_id and (f.is_active or has_permission('lineups.manage'))));
create policy "manage" on formation_assignments for all using (has_permission('lineups.manage')) with check (has_permission('lineups.manage'));

-- ═════════ 4) NAVIGATION look (site default; visitors can personalise if allowed) + FAVICON ═════════
insert into site_settings(key, value) values
  ('nav_theme', '"brand"'), ('nav_bg_style', '"solid"'), ('nav_bg_color', 'null'), ('nav_bg_image', 'null'),
  ('nav_bg_overlay', '0.4'), ('nav_allow_personalise', 'true'), ('favicon_url', 'null')
on conflict do nothing;
