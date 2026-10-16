-- Super Strikers — Phase 14: promotions & codes, spin wheel, sale prices
-- Safe to run more than once.

-- ═════════ 1) SALE PRICES (shown as "was … −20%") ═════════
alter table products add column if not exists compare_at_price numeric(10,2);
alter table products drop constraint if exists products_compare_at_ok;
alter table products add constraint products_compare_at_ok check (compare_at_price is null or compare_at_price >= 0);

-- ═════════ 2) PROMOTIONS: automatic offers, public codes, and personal prize codes ═════════
create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,                                   -- shown in the banner
  kind text not null check (kind in ('percent','fixed','free_delivery')),
  value numeric(10,2) not null default 0 check (value >= 0),
  max_discount numeric(10,2) check (max_discount is null or max_discount >= 0),
  min_subtotal numeric(10,2) not null default 0 check (min_subtotal >= 0),
  code text,                                      -- empty = applied automatically to every order that qualifies
  user_id uuid references profiles(id) on delete cascade,   -- set = personal code (spin prizes)
  source text not null default 'admin' check (source in ('admin','spin')),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  is_active boolean not null default true,
  show_banner boolean not null default false,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);
create unique index if not exists promotions_code_idx on promotions (lower(code)) where code is not null;
create index if not exists promotions_user_idx on promotions (user_id) where user_id is not null;
alter table promotions enable row level security;
drop policy if exists "public offers" on promotions;
drop policy if exists "own codes" on promotions;
drop policy if exists "manage" on promotions;
-- Visitors can see running offers that are automatic or meant for a banner. Secret codes are never listed.
create policy "public offers" on promotions for select using (
  is_active and user_id is null and (code is null or show_banner)
  and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy "own codes" on promotions for select using (user_id = auth.uid());
create policy "manage" on promotions for all using (has_permission('shop.manage')) with check (has_permission('shop.manage'));

alter table orders add column if not exists discount numeric(10,2) not null default 0;
alter table orders add column if not exists promo_code text;
alter table orders add column if not exists promo_title text;

-- What would this order get? Used by the cart (preview) and by place_order (the real thing).
create or replace function promo_quote(p_code text, p_subtotal numeric, p_fee numeric default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr promotions; best promotions; bestval numeric := -1; val numeric; d numeric; waived boolean;
        c text := nullif(trim(coalesce(p_code, '')), ''); uid uuid := auth.uid();
begin
  if c is not null then
    select * into pr from promotions where lower(code) = lower(c) and is_active order by created_at limit 1;
    if not found or (pr.user_id is not null and pr.user_id is distinct from uid) then return jsonb_build_object('ok', false, 'message', 'That code is not valid.'); end if;
    if pr.starts_at is not null and pr.starts_at > now() then return jsonb_build_object('ok', false, 'message', 'This offer has not started yet.'); end if;
    if pr.ends_at is not null and pr.ends_at <= now() then return jsonb_build_object('ok', false, 'message', 'This code has expired.'); end if;
    if pr.max_uses is not null and pr.uses >= pr.max_uses then return jsonb_build_object('ok', false, 'message', 'This code has already been used.'); end if;
    if p_subtotal < pr.min_subtotal then return jsonb_build_object('ok', false, 'message', 'Spend at least ' || to_char(pr.min_subtotal, 'FM999999990.00') || ' to use this code.'); end if;
    best := pr;
  else
    for pr in select * from promotions where is_active and code is null and user_id is null
        and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
        and (max_uses is null or uses < max_uses) and min_subtotal <= p_subtotal loop
      val := case pr.kind when 'percent' then least(round(p_subtotal * pr.value / 100, 2), coalesce(pr.max_discount, 1e12))
                          when 'fixed' then least(pr.value, p_subtotal) else coalesce(p_fee, 0) end;
      if val > bestval then best := pr; bestval := val; end if;
    end loop;
    if best.id is null then return jsonb_build_object('ok', true, 'discount', 0, 'free_delivery', false); end if;
  end if;
  d := case best.kind when 'percent' then round(p_subtotal * best.value / 100, 2) when 'fixed' then best.value else 0 end;
  if best.max_discount is not null then d := least(d, best.max_discount); end if;
  d := greatest(0, least(d, p_subtotal));
  waived := best.kind = 'free_delivery';
  return jsonb_build_object('ok', true, 'promo_id', best.id, 'title', best.title, 'code', best.code, 'discount', d, 'free_delivery', waived, 'fee_saved', case when waived then coalesce(p_fee, 0) else 0 end);
end $$;
grant execute on function promo_quote(text, numeric, numeric) to anon, authenticated;

-- place_order now takes an optional code and applies offers on the server (replaces the Phase 10 version)
drop function if exists place_order(jsonb, text, text, text, text, text, text, text);
create or replace function place_order(p_items jsonb, p_name text, p_email text, p_phone text default null,
  p_method text default 'pickup', p_address text default null, p_note text default null, p_payment text default 'offline', p_code text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare it jsonb; pr products; v product_variants; q int; unit numeric; total numeric := 0; fee numeric := 0; oid uuid; ref text;
        cur text; enabled text; n int; summary text := ''; rule notification_rules; role_ids uuid[]; totaltxt text; instr text;
        prov payment_providers; token text; offer jsonb; disc numeric := 0; waived boolean := false;
begin
  select value #>> '{}' into enabled from site_settings where key = 'shop_enabled';
  if enabled = 'false' then raise exception 'The shop is currently closed'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 120 then raise exception 'Please enter your name'; end if;
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 200 then raise exception 'Please enter a valid email'; end if;
  if p_method not in ('pickup','delivery') then raise exception 'Choose pickup or delivery'; end if;
  if p_method = 'delivery' and (p_address is null or char_length(trim(p_address)) < 5) then raise exception 'Please enter a delivery address'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Your cart is empty'; end if;
  select * into prov from payment_providers where key = coalesce(p_payment, 'offline') and enabled;
  if not found then raise exception 'That payment method is not available'; end if;
  if (select count(*) from orders where customer_email = lower(p_email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders from this email. Please try again later.'; end if;

  select coalesce(value #>> '{}', 'USD') into cur from site_settings where key = 'currency';
  select coalesce((value #>> '{}')::numeric, 0) into fee from site_settings where key = 'shop_delivery_fee';
  if p_method = 'pickup' then fee := 0; end if;
  ref := 'ORD-' || to_char(now(),'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,5));
  token := case when prov.kind <> 'offline' then encode(gen_random_bytes(16),'hex') end;
  insert into orders(reference, user_id, customer_name, customer_email, customer_phone, delivery_method, address, note, currency, delivery_fee, payment_method, payment_status, pay_token)
  values (ref, auth.uid(), trim(p_name), lower(trim(p_email)), nullif(trim(p_phone),''), p_method, nullif(trim(p_address),''), nullif(left(p_note,500),''),
          coalesce(cur,'USD'), fee, prov.key, case when prov.kind = 'offline' then 'unpaid' else 'pending' end, token)
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
  -- Offers: a typed/won code wins; otherwise the best automatic offer applies (checked here, never trusted from the app)
  offer := promo_quote(p_code, total, fee);
  if not coalesce((offer->>'ok')::boolean, false) then raise exception '%', coalesce(offer->>'message', 'That code is not valid.'); end if;
  disc := coalesce((offer->>'discount')::numeric, 0);
  waived := coalesce((offer->>'free_delivery')::boolean, false);
  if nullif(offer->>'promo_id', '') is not null then
    update promotions set uses = uses + 1 where id = (offer->>'promo_id')::uuid and (max_uses is null or uses < max_uses);
    get diagnostics n = row_count;
    if n = 0 then raise exception 'That offer has just run out'; end if;
  end if;
  if waived then fee := 0; end if;
  update orders set subtotal = total - disc, delivery_fee = fee, discount = disc, promo_code = offer->>'code', promo_title = offer->>'title' where id = oid;
  if disc > 0 then summary := summary || 'Discount' || coalesce(' (' || (offer->>'code') || ')', '') || ': -' || to_char(disc, 'FM999999990.00') || E'\n'; end if;

  totaltxt := coalesce(cur,'USD') || ' ' || to_char(total - disc + fee, 'FM999999990.00');
  instr := case when prov.kind = 'offline' then coalesce(prov.instructions, '') else 'Complete your payment online — we will email you as soon as it is confirmed.' end;
  perform enqueue_email('order_received', lower(trim(p_email)), trim(p_name),
    jsonb_build_object('order_ref', ref, 'order_summary', trim(trailing E'\n' from summary), 'order_total', totaltxt, 'payment_instructions', instr), auth.uid());
  select * into rule from notification_rules where event_key = 'order_placed' and enabled;
  if found and prov.kind = 'offline' then
    select array_agg(distinct ur.role_id) into role_ids from user_roles ur join role_permissions rp on rp.role_id = ur.role_id where rp.permission_key = 'orders.manage';
    if role_ids is not null then
      insert into notification_queue(title, body, data, audience_role_ids)
      values (render_template(rule.title_template, jsonb_build_object('order_ref', ref)),
              render_template(rule.body_template, jsonb_build_object('customer', trim(p_name), 'order_total', totaltxt)),
              jsonb_build_object('route','/admin/orders'), role_ids);
    end if;
  end if;
  return jsonb_build_object('order_id', oid, 'reference', ref, 'total', total - disc + fee, 'currency', coalesce(cur,'USD'), 'pay_token', token, 'payment_method', prov.key, 'kind', prov.kind);
end $$;
grant execute on function place_order(jsonb, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ═════════ 3) SPIN WHEEL ═════════
create table if not exists spin_segments (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  prize_kind text not null default 'none' check (prize_kind in ('none','percent','fixed','free_delivery')),
  value numeric(10,2) not null default 0 check (value >= 0),
  min_subtotal numeric(10,2) not null default 0 check (min_subtotal >= 0),
  weight numeric(10,2) not null default 1 check (weight >= 0),   -- relative chance; the wheel is NOT split evenly by chance
  color text not null default '#2E8B57' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  expires_days int not null default 14 check (expires_days between 1 and 365),
  sort_order int not null default 0,
  is_active boolean not null default true,
  check (prize_kind <> 'percent' or value <= 100)
);
create table if not exists spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  segment_id uuid references spin_segments(id) on delete set null,
  label text not null,
  prize_kind text not null,
  value numeric(10,2),
  promo_id uuid references promotions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists spins_user_idx on spins (user_id, created_at desc);
alter table spin_segments enable row level security;
alter table spins enable row level security;
drop policy if exists "manage" on spin_segments;
drop policy if exists "own or staff" on spins;
create policy "manage" on spin_segments for all using (has_permission('shop.manage')) with check (has_permission('shop.manage'));   -- weights stay private to staff
create policy "own or staff" on spins for select using (user_id = auth.uid() or has_permission('shop.manage'));

insert into site_settings(key, value) values ('spin_enabled', 'true'), ('spin_cooldown_hours', '168') on conflict do nothing;
-- Starter wheel: about 5% of spins win anything (change in Admin → Spin wheel)
insert into spin_segments (label, prize_kind, value, weight, color, sort_order)
select * from (values
  ('Try again',     'none',          0::numeric,  300::numeric, '#8A9099', 1),
  ('5% off',        'percent',       5,            40,          '#2E9E5B', 2),
  ('Not today',     'none',          0,            300,         '#5B6470', 3),
  ('Free delivery', 'free_delivery', 0,            20,          '#1E88E5', 4),
  ('Try again',     'none',          0,            300,         '#8A9099', 5),
  ('10% off',       'percent',       10,           8,           '#F57C00', 6),
  ('Not today',     'none',          0,            300,         '#5B6470', 7),
  ('20% off',       'percent',       20,           2,           '#D32F2F', 8)
) as v(label, prize_kind, value, weight, color, sort_order)
where not exists (select 1 from spin_segments);

-- What the wheel screen needs (no odds are revealed)
create or replace function spin_config()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare en text; hrs numeric; last timestamptz; uid uuid := auth.uid(); nxt timestamptz;
begin
  select value #>> '{}' into en from site_settings where key = 'spin_enabled';
  select coalesce((value #>> '{}')::numeric, 168) into hrs from site_settings where key = 'spin_cooldown_hours';
  hrs := coalesce(hrs, 168);
  if uid is not null then select max(created_at) into last from spins where user_id = uid; end if;
  nxt := case when last is null then null else last + make_interval(secs => (hrs * 3600)::double precision) end;
  return jsonb_build_object(
    'enabled', coalesce(en, 'true') <> 'false', 'signed_in', uid is not null, 'cooldown_hours', hrs,
    'next_spin_at', case when nxt > now() then nxt else null end,
    'segments', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'color', color, 'prize_kind', prize_kind, 'value', value) order by sort_order, id)
                          from spin_segments where is_active), '[]'::jsonb));
end $$;
grant execute on function spin_config() to anon, authenticated;

-- The spin itself: chance is decided here, on the server, once per cooldown per member
create or replace function spin_wheel()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); en text; hrs numeric; last timestamptz; total numeric; r numeric; acc numeric := 0;
        seg spin_segments; chosen spin_segments; idx int := 0; cidx int := 0; code text; pid uuid; ends timestamptz; nxt timestamptz;
begin
  if uid is null then raise exception 'Please sign in to spin the wheel'; end if;
  select value #>> '{}' into en from site_settings where key = 'spin_enabled';
  if coalesce(en, 'true') = 'false' then raise exception 'The wheel is not available right now'; end if;
  select coalesce((value #>> '{}')::numeric, 168) into hrs from site_settings where key = 'spin_cooldown_hours';
  hrs := coalesce(hrs, 168);
  perform pg_advisory_xact_lock(hashtext('spin:' || uid::text));
  select max(created_at) into last from spins where user_id = uid;
  if last is not null and last + make_interval(secs => (hrs * 3600)::double precision) > now() then
    raise exception 'You have already spun. Come back later for another go!'; end if;
  select coalesce(sum(weight), 0) into total from spin_segments where is_active;
  if total <= 0 then raise exception 'The wheel is not set up yet'; end if;
  r := random() * total;
  for seg in select * from spin_segments where is_active order by sort_order, id loop
    if chosen.id is null and seg.weight > 0 and r < acc + seg.weight then chosen := seg; cidx := idx; end if;
    acc := acc + seg.weight; idx := idx + 1;
  end loop;
  if chosen.id is null then   -- rounding safety: last segment that can win
    select * into chosen from spin_segments where is_active and weight > 0 order by sort_order desc, id desc limit 1;
    select count(*) into cidx from spin_segments s where s.is_active and (s.sort_order, s.id) < (chosen.sort_order, chosen.id);
  end if;
  if chosen.prize_kind <> 'none' then
    code := 'SPIN-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
    insert into promotions(title, kind, value, min_subtotal, code, user_id, source, ends_at, max_uses, is_active, show_banner)
    values ('Spin & win: ' || chosen.label, chosen.prize_kind, chosen.value, chosen.min_subtotal, code, uid, 'spin', now() + make_interval(days => chosen.expires_days), 1, true, false)
    returning id, ends_at into pid, ends;
  end if;
  insert into spins(user_id, segment_id, label, prize_kind, value, promo_id) values (uid, chosen.id, chosen.label, chosen.prize_kind, chosen.value, pid);
  nxt := now() + make_interval(secs => (hrs * 3600)::double precision);
  return jsonb_build_object('index', cidx, 'label', chosen.label, 'prize_kind', chosen.prize_kind, 'value', chosen.value, 'code', code,
    'expires_at', ends, 'min_subtotal', chosen.min_subtotal, 'next_spin_at', nxt);
end $$;
revoke all on function spin_wheel() from public, anon;
grant execute on function spin_wheel() to authenticated;
