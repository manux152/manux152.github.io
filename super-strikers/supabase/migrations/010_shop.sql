-- Super Strikers — Phase 9b: shop (catalogue, cart checkout via secure RPC, order management)
-- Payment is collected offline (cash / mobile money / bank transfer) and marked as paid by an admin.

insert into permissions(key, description) values ('shop.manage','Manage products, photos and stock'), ('orders.manage','View and process shop orders');
insert into role_permissions select r.id, p.key from roles r join permissions p on p.key in ('shop.manage','orders.manage') where r.name in ('Admin','Manager');

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0
);
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  category_id uuid references product_categories(id) on delete set null,
  price numeric(10,2) not null check (price >= 0),
  stock int check (stock >= 0),                 -- null = unlimited (ignored when the product has size/option variants)
  is_active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);
create index products_cat_idx on products(category_id);
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  sort_order int not null default 0
);
create index product_images_idx on product_images(product_id, sort_order);
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,                          -- e.g. "M", "Black / L"
  price_delta numeric(10,2) not null default 0,
  stock int check (stock >= 0),                 -- null = unlimited
  is_active boolean not null default true,
  unique (product_id, label)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  user_id uuid references profiles(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  delivery_method text not null default 'pickup' check (delivery_method in ('pickup','delivery')),
  address text,
  note text,
  status text not null default 'new' check (status in ('new','paid','ready','completed','cancelled')),
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);
create index orders_created_idx on orders(created_at desc);
create index orders_email_idx on orders(customer_email, created_at desc);
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  name text not null,
  variant_label text,
  unit_price numeric(10,2) not null,
  quantity int not null check (quantity > 0)
);
create index order_items_order_idx on order_items(order_id);

-- Storage for product photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop','shop', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "shop read" on storage.objects for select using (bucket_id = 'shop');
create policy "shop upload" on storage.objects for insert to authenticated with check (bucket_id = 'shop' and has_permission('shop.manage'));
create policy "shop delete" on storage.objects for delete to authenticated using (bucket_id = 'shop' and has_permission('shop.manage'));

-- RLS
alter table product_categories enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table product_variants enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
create policy "public read" on product_categories for select using (true);
create policy "manage" on product_categories for all using (has_permission('shop.manage'));
create policy "public read" on products for select using (is_active or has_permission('shop.manage'));
create policy "manage" on products for all using (has_permission('shop.manage'));
create policy "public read" on product_images for select using (true);
create policy "manage" on product_images for all using (has_permission('shop.manage'));
create policy "public read" on product_variants for select using (is_active or has_permission('shop.manage'));
create policy "manage" on product_variants for all using (has_permission('shop.manage'));
-- Orders can only be created through place_order(); customers who are signed in can read their own
create policy "own or staff read" on orders for select using (user_id = auth.uid() or has_permission('orders.manage'));
create policy "staff update" on orders for update using (has_permission('orders.manage'));
create policy "own or staff read" on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or has_permission('orders.manage'))));

-- Settings
insert into site_settings(key, value) values
  ('currency','"USD"'), ('shop_enabled','true'), ('shop_delivery_fee','0'),
  ('shop_payment_instructions','"Pay when you collect your order (cash or mobile money). The team will confirm your payment."')
  on conflict do nothing;
insert into nav_items(label, route, sort_order) values ('Shop','/shop',11);

-- ───────── Email templates + rule ─────────
insert into email_templates(event_key, label, subject, body, button_label, button_url, variables, is_system) values
('order_received','Order received (customer)','We received your order {order_ref}',
 E'Hi {first_name},\n\nThanks for your order **{order_ref}** with {team}.\n\n{order_summary}\n\nTotal: **{order_total}**\n\n{payment_instructions}',
 null,null,'{first_name} {team} {order_ref} {order_summary} {order_total} {payment_instructions}',true),
('order_status','Order status update (customer)','Update on your order {order_ref}: {status_label}',
 E'Hi {first_name},\n\nYour order **{order_ref}** is now **{status_label}**.\n\n{status_message}',
 null,null,'{first_name} {team} {order_ref} {status_label} {status_message}',true) on conflict do nothing;
insert into notification_rules(event_key, label, title_template, body_template) values
  ('order_placed','New shop order (staff)','🛒 New order {order_ref}','{customer} · {order_total}') on conflict do nothing;

-- ───────── Secure checkout ─────────
create or replace function place_order(p_items jsonb, p_name text, p_email text, p_phone text default null,
  p_method text default 'pickup', p_address text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare it jsonb; pr products; v product_variants; q int; unit numeric; total numeric := 0; fee numeric := 0; oid uuid; ref text;
        cur text; enabled text; n int; summary text := ''; team text; rule notification_rules; role_ids uuid[]; totaltxt text; instr text;
begin
  select value #>> '{}' into enabled from site_settings where key = 'shop_enabled';
  if enabled = 'false' then raise exception 'The shop is currently closed'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 120 then raise exception 'Please enter your name'; end if;
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 200 then raise exception 'Please enter a valid email'; end if;
  if p_method not in ('pickup','delivery') then raise exception 'Choose pickup or delivery'; end if;
  if p_method = 'delivery' and (p_address is null or char_length(trim(p_address)) < 5) then raise exception 'Please enter a delivery address'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Your cart is empty'; end if;
  if (select count(*) from orders where customer_email = lower(p_email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders from this email. Please try again later.'; end if;

  select coalesce(value #>> '{}', 'USD') into cur from site_settings where key = 'currency';
  select coalesce((value #>> '{}')::numeric, 0) into fee from site_settings where key = 'shop_delivery_fee';
  if p_method = 'pickup' then fee := 0; end if;
  ref := 'ORD-' || to_char(now(),'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,5));
  insert into orders(reference, user_id, customer_name, customer_email, customer_phone, delivery_method, address, note, currency, delivery_fee)
  values (ref, auth.uid(), trim(p_name), lower(trim(p_email)), nullif(trim(p_phone),''), p_method, nullif(trim(p_address),''), nullif(left(p_note,500),''), coalesce(cur,'USD'), fee)
  returning id into oid;

  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'qty')::int;
    if q is null or q < 1 or q > 20 then raise exception 'Invalid quantity'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and is_active;
    if not found then raise exception 'An item in your cart is no longer available'; end if;
    if nullif(it->>'variant_id','') is not null then
      select * into v from product_variants where id = (it->>'variant_id')::uuid and product_id = pr.id and is_active;
      if not found then raise exception 'The chosen option for % is no longer available', pr.name; end if;
      update product_variants set stock = stock - q where id = v.id and (stock is null or stock >= q);
      get diagnostics n = row_count;
      if n = 0 then raise exception 'Not enough stock for % (%)', pr.name, v.label; end if;
      unit := pr.price + v.price_delta;
      insert into order_items(order_id, product_id, variant_id, name, variant_label, unit_price, quantity) values (oid, pr.id, v.id, pr.name, v.label, unit, q);
      summary := summary || q || ' × ' || pr.name || ' (' || v.label || ')' || E'\n';
    else
      if exists (select 1 from product_variants where product_id = pr.id and is_active) then raise exception 'Please choose an option for %', pr.name; end if;
      update products set stock = stock - q where id = pr.id and (stock is null or stock >= q);
      get diagnostics n = row_count;
      if n = 0 then raise exception 'Not enough stock for %', pr.name; end if;
      unit := pr.price;
      insert into order_items(order_id, product_id, name, unit_price, quantity) values (oid, pr.id, pr.name, unit, q);
      summary := summary || q || ' × ' || pr.name || E'\n';
    end if;
    total := total + unit * q;
  end loop;
  update orders set subtotal = total where id = oid;

  totaltxt := coalesce(cur,'USD') || ' ' || to_char(total + fee, 'FM999999990.00');
  select value #>> '{}' into instr from site_settings where key = 'shop_payment_instructions';
  select value #>> '{}' into team from site_settings where key = 'team_name';
  perform enqueue_email('order_received', lower(trim(p_email)), trim(p_name),
    jsonb_build_object('order_ref', ref, 'order_summary', trim(trailing E'\n' from summary), 'order_total', totaltxt, 'payment_instructions', coalesce(instr,'')), auth.uid());
  select * into rule from notification_rules where event_key = 'order_placed' and enabled;
  if found then
    select array_agg(distinct ur.role_id) into role_ids from user_roles ur join role_permissions rp on rp.role_id = ur.role_id where rp.permission_key = 'orders.manage';
    if role_ids is not null then
      insert into notification_queue(title, body, data, audience_role_ids)
      values (render_template(rule.title_template, jsonb_build_object('order_ref', ref)),
              render_template(rule.body_template, jsonb_build_object('customer', trim(p_name), 'order_total', totaltxt)),
              jsonb_build_object('route','/admin/orders'), role_ids);
    end if;
  end if;
  return jsonb_build_object('order_id', oid, 'reference', ref, 'total', total + fee, 'currency', coalesce(cur,'USD'));
end $$;
grant execute on function place_order(jsonb,text,text,text,text,text,text) to anon, authenticated;

-- Status changes: email the customer; cancelling returns stock
create or replace function order_status_changed() returns trigger language plpgsql security definer set search_path = public as $$
declare lbl text; msg text; r record;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in select * from order_items where order_id = new.id loop
      if r.variant_id is not null then update product_variants set stock = stock + r.quantity where id = r.variant_id and stock is not null;
      elsif r.product_id is not null then update products set stock = stock + r.quantity where id = r.product_id and stock is not null; end if;
    end loop;
  end if;
  lbl := case new.status when 'paid' then 'Paid' when 'ready' then 'Ready' when 'completed' then 'Completed' when 'cancelled' then 'Cancelled' else 'Received' end;
  msg := case new.status when 'paid' then 'We have received your payment. Thank you!'
    when 'ready' then case when new.delivery_method = 'delivery' then 'Your order is on its way.' else 'Your order is ready for collection.' end
    when 'completed' then 'Your order is complete. Thanks for supporting the team!'
    when 'cancelled' then 'Your order was cancelled. If you did not expect this, please contact the team.' else '' end;
  perform enqueue_email('order_status', new.customer_email, new.customer_name,
    jsonb_build_object('order_ref', new.reference, 'status_label', lbl, 'status_message', msg), new.user_id);
  return null;
end $$;
create trigger order_status_notify after update of status on orders for each row execute function order_status_changed();
