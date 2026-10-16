-- Super Strikers — Phase 10: online shop payments (Stripe, Flutterwave) + training attendance

-- ═════════ PAYMENTS ═════════
insert into permissions(key, description) values ('payments.manage','Manage payment methods, review payments and refund');
insert into role_permissions select r.id, 'payments.manage' from roles r where r.name in ('Admin','Manager');

alter table orders add column payment_method text not null default 'offline';
alter table orders add column payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','refunded'));
alter table orders add column pay_token text;           -- lets a guest customer pay / check status for their own order only
alter table orders add column paid_at timestamptz;
alter table orders add column payment_ref text;
update orders set payment_status = 'paid', paid_at = coalesce(paid_at, created_at) where status in ('paid','ready','completed');

create table payment_providers (
  key text primary key,
  kind text not null check (kind in ('offline','stripe','flutterwave')),
  label text not null,
  enabled boolean not null default false,
  sort_order int not null default 0,
  instructions text,
  mode text not null default 'test' check (mode in ('test','live'))
);
insert into payment_providers(key, kind, label, enabled, sort_order, instructions) values
  ('offline','offline','Pay on collection (cash / mobile money)', true, 1,
     coalesce((select value #>> '{}' from site_settings where key = 'shop_payment_instructions'), 'The team will confirm your payment.')),
  ('stripe','stripe','Card (Stripe)', false, 2, 'You will be taken to a secure Stripe page to pay by card.'),
  ('flutterwave','flutterwave','Card / Mobile money (Flutterwave)', false, 3, 'You will be taken to a secure Flutterwave page to pay by card or mobile money.');

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_ref text not null,
  amount numeric(10,2) not null,
  currency text not null,
  status text not null check (status in ('succeeded','refunded','mismatch')),
  refunded_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payments_created_idx on payments(created_at desc);
alter table payment_providers enable row level security;
alter table payments enable row level security;
create policy "public read enabled" on payment_providers for select using (enabled or has_permission('payments.manage'));
create policy "manage" on payment_providers for all using (has_permission('payments.manage'));
create policy "staff read" on payments for select using (has_permission('payments.manage') or has_permission('orders.manage'));

insert into site_settings(key, value) values ('shop_payment_hold_minutes','60') on conflict do nothing;

-- Staff alert helper
create or replace function notify_orders_staff(p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare role_ids uuid[];
begin
  select array_agg(distinct ur.role_id) into role_ids from user_roles ur join role_permissions rp on rp.role_id = ur.role_id
   where rp.permission_key in ('orders.manage','payments.manage');
  if role_ids is not null then
    insert into notification_queue(title, body, data, audience_role_ids) values (p_title, p_body, jsonb_build_object('route','/admin/payments'), role_ids);
  end if;
end $$;
revoke execute on function notify_orders_staff(text,text) from public, anon, authenticated;

-- Offline orders marked "paid" by an admin also count as paid
create or replace function orders_sync_payment() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status <> 'paid' and new.payment_status <> 'paid' then new.payment_status := 'paid'; new.paid_at := now(); end if;
  return new;
end $$;
create trigger orders_sync_payment before update of status on orders for each row execute function orders_sync_payment();

-- Called only by the payment edge functions (service role) after the provider confirms a payment
create or replace function mark_order_paid(p_order uuid, p_provider text, p_ref text, p_amount numeric, p_currency text) returns text
language plpgsql security definer set search_path = public as $$
declare o orders; total numeric;
begin
  select * into o from orders where id = p_order for update;
  if not found then return 'not_found'; end if;
  if exists (select 1 from payments where provider = p_provider and provider_ref = p_ref) then return 'duplicate'; end if;
  total := o.subtotal + o.delivery_fee;
  if upper(p_currency) <> upper(o.currency) or abs(p_amount - total) > 0.01 then
    insert into payments(order_id, provider, provider_ref, amount, currency, status) values (p_order, p_provider, p_ref, p_amount, upper(p_currency), 'mismatch');
    perform notify_orders_staff('Payment needs review', 'Order ' || o.reference || ': amount or currency did not match');
    return 'mismatch';
  end if;
  insert into payments(order_id, provider, provider_ref, amount, currency, status) values (p_order, p_provider, p_ref, p_amount, upper(p_currency), 'succeeded');
  update orders set payment_status = 'paid', paid_at = now(), payment_ref = p_ref, status = case when status = 'new' then 'paid' else status end where id = p_order;
  if o.status = 'cancelled' then
    perform notify_orders_staff('Paid after cancellation', 'Order ' || o.reference || ' was cancelled but a payment arrived — refund it or reinstate the order');
  end if;
  return 'ok';
end $$;
create or replace function mark_order_payment_failed(p_order uuid) returns void language sql security definer set search_path = public as $$
  update orders set payment_status = 'failed' where id = p_order and payment_status = 'pending';
$$;
create or replace function mark_order_refunded(p_provider text, p_ref text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare pm payments;
begin
  select * into pm from payments where provider = p_provider and provider_ref = p_ref for update;
  if not found then return; end if;
  update payments set refunded_amount = least(pm.amount, greatest(pm.refunded_amount, p_amount)),
    status = case when p_amount >= pm.amount then 'refunded' else pm.status end where id = pm.id;
  if p_amount >= pm.amount then update orders set payment_status = 'refunded' where id = pm.order_id; end if;
end $$;
revoke execute on function mark_order_paid(uuid,text,text,numeric,text) from public, anon, authenticated;
revoke execute on function mark_order_payment_failed(uuid) from public, anon, authenticated;
revoke execute on function mark_order_refunded(text,text,numeric) from public, anon, authenticated;

-- Customer-facing status check (needs the order's private token)
create or replace function order_payment_status(p_order uuid, p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('reference', reference, 'status', status, 'payment_status', payment_status, 'payment_method', payment_method,
                            'total', subtotal + delivery_fee, 'currency', currency)
  from orders where id = p_order and pay_token is not null and pay_token = p_token;
$$;
grant execute on function order_payment_status(uuid, text) to anon, authenticated;

-- Unpaid online orders release their stock after the hold time
create or replace function expire_unpaid_orders() returns int language plpgsql security definer set search_path = public as $$
declare mins int; n int;
begin
  select coalesce((value #>> '{}')::int, 60) into mins from site_settings where key = 'shop_payment_hold_minutes';
  update orders set status = 'cancelled' where status = 'new' and payment_method <> 'offline' and payment_status in ('pending','failed','unpaid')
    and created_at < now() - (coalesce(mins,60) * interval '1 minute');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function expire_unpaid_orders() from public, anon, authenticated;
create or replace function run_expire_unpaid_orders() returns int language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('payments.manage') then raise exception 'Forbidden'; end if;
  return expire_unpaid_orders();
end $$;

-- Checkout now records the chosen payment method
drop function if exists place_order(jsonb,text,text,text,text,text,text);
create or replace function place_order(p_items jsonb, p_name text, p_email text, p_phone text default null,
  p_method text default 'pickup', p_address text default null, p_note text default null, p_payment text default 'offline')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare it jsonb; pr products; v product_variants; q int; unit numeric; total numeric := 0; fee numeric := 0; oid uuid; ref text;
        cur text; enabled text; n int; summary text := ''; rule notification_rules; role_ids uuid[]; totaltxt text; instr text;
        prov payment_providers; token text;
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
  update orders set subtotal = total where id = oid;

  totaltxt := coalesce(cur,'USD') || ' ' || to_char(total + fee, 'FM999999990.00');
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
  return jsonb_build_object('order_id', oid, 'reference', ref, 'total', total + fee, 'currency', coalesce(cur,'USD'), 'pay_token', token, 'payment_method', prov.key, 'kind', prov.kind);
end $$;
grant execute on function place_order(jsonb,text,text,text,text,text,text,text) to anon, authenticated;

-- Paying staff alert for online orders once they are actually paid
create or replace function order_paid_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare rule notification_rules; role_ids uuid[];
begin
  if new.payment_method = 'offline' or new.payment_status <> 'paid' or old.payment_status = 'paid' then return null; end if;
  select * into rule from notification_rules where event_key = 'order_placed' and enabled;
  if found then
    select array_agg(distinct ur.role_id) into role_ids from user_roles ur join role_permissions rp on rp.role_id = ur.role_id where rp.permission_key = 'orders.manage';
    if role_ids is not null then
      insert into notification_queue(title, body, data, audience_role_ids)
      values ('💳 Paid order ' || new.reference, new.customer_name || ' · ' || new.currency || ' ' || to_char(new.subtotal + new.delivery_fee, 'FM999999990.00'), jsonb_build_object('route','/admin/orders'), role_ids);
    end if;
  end if;
  return null;
end $$;
create trigger order_paid_notify after update of payment_status on orders for each row execute function order_paid_alert();

-- ═════════ TRAINING ATTENDANCE ═════════
create table training_attendance (
  session_id uuid references training_sessions(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  status text not null check (status in ('present','late','excused','absent')),
  note text,
  source text not null default 'coach' check (source in ('coach','self')),
  marked_by uuid references profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index training_att_player_idx on training_attendance(player_id);
create table training_checkin (
  session_id uuid primary key references training_sessions(id) on delete cascade,
  code text not null,
  opened_at timestamptz not null default now()
);
create table training_checkin_attempts (
  session_id uuid references training_sessions(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  fails int not null default 0,
  primary key (session_id, player_id)
);
alter table training_attendance enable row level security;
alter table training_checkin enable row level security;
alter table training_checkin_attempts enable row level security;
create policy "staff or own read" on training_attendance for select using (
  has_permission('training.manage') or exists (select 1 from players p where p.id = player_id and p.profile_id = auth.uid()));
create policy "manage" on training_attendance for all using (has_permission('training.manage'));
create policy "manage" on training_checkin for all using (has_permission('training.manage'));

create or replace function open_training_checkin(p_session uuid) returns text language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if not has_permission('training.manage') then raise exception 'Forbidden'; end if;
  c := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into training_checkin(session_id, code) values (p_session, c)
    on conflict (session_id) do update set code = excluded.code, opened_at = now();
  delete from training_checkin_attempts where session_id = p_session;
  update training_sessions set visibility = 'team' where id = p_session;     -- players must be able to see the session to check in
  return c;
end $$;
create or replace function close_training_checkin(p_session uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('training.manage') then raise exception 'Forbidden'; end if;
  delete from training_checkin where session_id = p_session;
end $$;
create or replace function check_in_training(p_session uuid, p_code text) returns text language plpgsql security definer set search_path = public as $$
declare pl players; s training_sessions; ck training_checkin; f int; existing text; st text;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  select * into pl from players where profile_id = auth.uid();
  if not found then raise exception 'Your account is not linked to a player'; end if;
  select * into s from training_sessions where id = p_session;
  if not found or now() < s.session_date - interval '60 minutes' or now() > s.session_date + interval '4 hours' then raise exception 'Check-in is not open right now'; end if;
  select * into ck from training_checkin where session_id = p_session;
  if not found then raise exception 'Check-in is closed for this session'; end if;
  select fails into f from training_checkin_attempts where session_id = p_session and player_id = pl.id;
  if coalesce(f,0) >= 5 then raise exception 'Too many wrong codes. Ask your coach to mark you in.'; end if;
  if trim(coalesce(p_code,'')) <> ck.code then
    insert into training_checkin_attempts(session_id, player_id, fails) values (p_session, pl.id, 1)
      on conflict (session_id, player_id) do update set fails = training_checkin_attempts.fails + 1;
    raise exception 'That code is not right';
  end if;
  select status into existing from training_attendance where session_id = p_session and player_id = pl.id;
  if existing in ('present','late','excused') then return existing; end if;
  st := case when now() > s.session_date + interval '15 minutes' then 'late' else 'present' end;
  insert into training_attendance(session_id, player_id, status, source, marked_by) values (p_session, pl.id, st, 'self', auth.uid())
    on conflict (session_id, player_id) do update set status = excluded.status, source = 'self', marked_by = auth.uid(), marked_at = now();
  return st;
end $$;
