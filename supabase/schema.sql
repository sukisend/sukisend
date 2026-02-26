-- SUKI SEND POS - v2 upgrade schema
-- Run after the base schema (or run as-is if tables already exist).

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enum upgrades
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('pending');
  end if;

  alter type public.order_status add value if not exists 'approved';
  alter type public.order_status add value if not exists 'confirmed';
  alter type public.order_status add value if not exists 'preparing';
  alter type public.order_status add value if not exists 'packed';
  alter type public.order_status add value if not exists 'shipped';
  alter type public.order_status add value if not exists 'out_for_delivery';
  alter type public.order_status add value if not exists 'delivered';
  alter type public.order_status add value if not exists 'completed';
  alter type public.order_status add value if not exists 'refund_requested';
  alter type public.order_status add value if not exists 'refunded';
  alter type public.order_status add value if not exists 'cancelled';
  alter type public.order_status add value if not exists 'pending';
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('unpaid', 'paid', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'refund_status') then
    create type public.refund_status as enum ('open', 'approved', 'rejected', 'cancelled');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Base tables (safe for fresh setup)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Suki User',
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sku text unique,
  category_id uuid not null references public.categories(id) on delete restrict,
  unit text not null default 'pcs',
  cost numeric(12,2) not null check (cost >= 0),
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 5 check (min_stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.order_no_seq start 10000;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('SS-' || nextval('public.order_no_seq')::text),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  status public.order_status not null default 'pending',
  payment_method text not null default 'COD',
  delivery_area text not null default '',
  delivery_address text not null default '',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  sku text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  change_qty integer not null,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Product media / variants / address / shipping
-- -----------------------------------------------------------------------------
alter table public.categories add column if not exists icon text;

alter table public.products add column if not exists on_sale boolean not null default false;
alter table public.products add column if not exists sale_price numeric(12,2) check (sale_price is null or sale_price >= 0);
alter table public.products add column if not exists sort_priority integer not null default 0;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  value text not null,
  price_delta numeric(12,2) not null default 0,
  stock_override integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, name, value)
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  country_region text not null default 'Philippines',
  first_name text not null,
  last_name text not null,
  phone text not null,
  province text not null,
  city text not null,
  barangay text not null,
  postal_code text not null,
  line1 text not null,
  line2 text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  base_fee numeric(12,2) not null default 0 check (base_fee >= 0),
  eta_min_days integer,
  eta_max_days integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_addresses add column if not exists latitude numeric(10,7);
alter table public.customer_addresses add column if not exists longitude numeric(10,7);

-- -----------------------------------------------------------------------------
-- Order lifecycle upgrades
-- -----------------------------------------------------------------------------
alter table public.orders add column if not exists payment_status public.payment_status not null default 'unpaid';
alter table public.orders add column if not exists shipping_method_id uuid references public.shipping_methods(id) on delete set null;
alter table public.orders add column if not exists shipping_method_name text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists latest_lat numeric(10,7);
alter table public.orders add column if not exists latest_lng numeric(10,7);
alter table public.orders add column if not exists expected_delivery_start date;
alter table public.orders add column if not exists expected_delivery_end date;
alter table public.orders add column if not exists customer_note text;
alter table public.orders add column if not exists approved_at timestamptz;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists refunded_at timestamptz;
alter table public.orders add column if not exists refund_deadline_at timestamptz;
alter table public.orders add column if not exists refund_override_until timestamptz;

alter table public.order_items add column if not exists variant_id uuid references public.product_variants(id) on delete set null;
alter table public.order_items add column if not exists variant_name text;
alter table public.order_items add column if not exists variant_value text;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  title text not null,
  description text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  event_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(customer_id, product_id)
);

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  status public.refund_status not null default 'open',
  reason text not null,
  note text,
  evidence_urls text[] not null default '{}',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  admin_note text
);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id, customer_id)
);

create table if not exists public.review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.rider_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(order_id, customer_id)
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_product_images_product on public.product_images(product_id, sort_order);
create index if not exists idx_product_variants_product on public.product_variants(product_id, is_active);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_order_status_history_order_event on public.order_status_history(order_id, event_at desc);
create index if not exists idx_addresses_customer_default on public.customer_addresses(customer_id, is_default);
create index if not exists idx_wishlist_customer on public.wishlist_items(customer_id, created_at desc);
create index if not exists idx_refund_requests_order on public.refund_requests(order_id, requested_at desc);
create index if not exists idx_product_reviews_product on public.product_reviews(product_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Shared functions
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Suki User'),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role = 'admin'
  );
$$;

create or replace function public.ensure_single_default_address()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.customer_addresses
    set is_default = false
    where customer_id = new.customer_id
      and id <> coalesce(new.id, gen_random_uuid());
  elsif tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.customer_addresses a
      where a.customer_id = new.customer_id
        and a.is_default = true
    ) then
      new.is_default = true;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.promote_default_address_after_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_default then
    with next_addr as (
      select id
      from public.customer_addresses
      where customer_id = old.customer_id
      order by created_at asc
      limit 1
    )
    update public.customer_addresses
    set is_default = true
    where id in (select id from next_addr);
  end if;

  return null;
end;
$$;

create or replace function public.order_status_title(p_status public.order_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'pending' then 'Order placed'
    when 'approved' then 'Order approved'
    when 'confirmed' then 'Order confirmed'
    when 'preparing' then 'Preparing to ship'
    when 'packed' then 'Packed'
    when 'shipped' then 'Order shipped'
    when 'out_for_delivery' then 'Out for delivery'
    when 'delivered' then 'Delivered'
    when 'completed' then 'Order completed'
    when 'refund_requested' then 'Refund requested'
    when 'refunded' then 'Refund completed'
    when 'cancelled' then 'Order cancelled'
    else 'Order update'
  end;
$$;

create or replace function public.append_order_history(
  p_order_id uuid,
  p_status public.order_status,
  p_title text,
  p_description text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_event_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_status_history (
    order_id,
    status,
    title,
    description,
    latitude,
    longitude,
    event_at,
    created_by
  )
  values (
    p_order_id,
    p_status,
    coalesce(nullif(p_title, ''), public.order_status_title(p_status)),
    p_description,
    p_lat,
    p_lng,
    coalesce(p_event_at, now()),
    auth.uid()
  );
end;
$$;

create or replace function public.can_transition_order(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = p_to then true
    when p_from = 'pending' and p_to in ('approved', 'confirmed', 'cancelled') then true
    when p_from in ('approved', 'confirmed') and p_to in ('preparing', 'packed', 'cancelled') then true
    when p_from in ('preparing', 'packed') and p_to in ('shipped', 'out_for_delivery', 'cancelled') then true
    when p_from = 'shipped' and p_to in ('out_for_delivery', 'cancelled') then true
    when p_from = 'out_for_delivery' and p_to in ('delivered', 'cancelled') then true
    when p_from = 'delivered' and p_to in ('completed', 'refund_requested') then true
    when p_from = 'completed' and p_to in ('refund_requested') then true
    when p_from = 'refund_requested' and p_to in ('refunded', 'completed') then true
    else false
  end;
$$;

create or replace function public.restore_order_inventory(
  p_order_id uuid,
  p_reason text default 'Order cancelled'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  for v_item in
    select id, product_id, variant_id, quantity
    from public.order_items
    where order_id = p_order_id
  loop
    update public.products
    set stock = stock + v_item.quantity
    where id = v_item.product_id;

    update public.product_variants
    set stock_override = coalesce(stock_override, 0) + v_item.quantity
    where id = v_item.variant_id
      and stock_override is not null;

    insert into public.stock_movements (
      product_id,
      change_qty,
      reason,
      created_by
    )
    values (
      v_item.product_id,
      v_item.quantity,
      coalesce(nullif(p_reason, ''), 'Order cancelled / returned'),
      auth.uid()
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Checkout / order lifecycle functions
-- -----------------------------------------------------------------------------
drop function if exists public.create_cod_order(uuid, text, text, numeric, jsonb);

create or replace function public.create_cod_order(
  p_customer_id uuid,
  p_address_id uuid,
  p_shipping_method_id uuid,
  p_items jsonb,
  p_customer_note text default null,
  p_delivery_fee numeric default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_no text;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_item jsonb;
  v_qty integer;
  v_product record;
  v_variant_id uuid;
  v_variant_name text;
  v_variant_value text;
  v_variant_price_delta numeric(12,2);
  v_variant_stock_override integer;
  v_unit_price numeric(12,2);
  v_address record;
  v_shipping record;
  v_delivery_area text;
  v_delivery_address text;
  v_item_variant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if auth.uid() <> p_customer_id and not public.is_admin(auth.uid()) then
    raise exception 'You can only create your own order.';
  end if;

  select *
  into v_address
  from public.customer_addresses
  where id = p_address_id
    and customer_id = p_customer_id;

  if not found then
    raise exception 'Please set a valid delivery address before checkout.';
  end if;

  select *
  into v_shipping
  from public.shipping_methods
  where id = p_shipping_method_id
    and is_active = true;

  if not found then
    raise exception 'Please select an active shipping method.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must include at least one item.';
  end if;

  v_delivery_fee := case
    when p_delivery_fee is not null and p_delivery_fee >= 0 then p_delivery_fee
    else coalesce(v_shipping.base_fee, 0)
  end;
  v_delivery_area := concat_ws(', ', v_address.barangay, v_address.city, v_address.province);
  v_delivery_address := concat_ws(', ', v_address.line1, v_address.line2, v_address.barangay, v_address.city, v_address.province, v_address.postal_code, v_address.country_region);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_qty <= 0 then
      raise exception 'Invalid item quantity.';
    end if;

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    if not found then
      raise exception 'Product not found.';
    end if;

    if not v_product.is_active then
      raise exception 'Product % is inactive.', v_product.name;
    end if;

    if v_product.stock < v_qty then
      raise exception 'Not enough stock for %.', v_product.name;
    end if;

    v_item_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;
    v_unit_price := case
      when v_product.on_sale = true and v_product.sale_price is not null and v_product.sale_price >= 0
        then v_product.sale_price
      else v_product.price
    end;

    if v_item_variant_id is not null then
      select id, name, value, price_delta, stock_override
      into v_variant_id, v_variant_name, v_variant_value, v_variant_price_delta, v_variant_stock_override
      from public.product_variants
      where id = v_item_variant_id
        and product_id = v_product.id
        and is_active = true
      for update;

      if not found then
        raise exception 'Invalid product variant selected for %.', v_product.name;
      end if;

      if v_variant_stock_override is not null and v_variant_stock_override < v_qty then
        raise exception 'Not enough stock for variant % (%).', v_variant_name, v_variant_value;
      end if;

      v_unit_price := v_unit_price + coalesce(v_variant_price_delta, 0);
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  end loop;

  insert into public.orders (
    id,
    customer_id,
    status,
    payment_method,
    payment_status,
    shipping_method_id,
    shipping_method_name,
    delivery_area,
    delivery_address,
    customer_note,
    subtotal,
    delivery_fee,
    total,
    expected_delivery_start,
    expected_delivery_end
  )
  values (
    v_order_id,
    p_customer_id,
    'pending',
    'COD',
    'unpaid',
    v_shipping.id,
    v_shipping.name,
    v_delivery_area,
    v_delivery_address,
    nullif(p_customer_note, ''),
    v_subtotal,
    v_delivery_fee,
    v_subtotal + v_delivery_fee,
    case when v_shipping.eta_min_days is not null then (now() + make_interval(days => v_shipping.eta_min_days))::date else null end,
    case when v_shipping.eta_max_days is not null then (now() + make_interval(days => v_shipping.eta_max_days))::date else null end
  )
  returning order_no into v_order_no;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    v_item_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    v_variant_id := null;
    v_variant_name := null;
    v_variant_value := null;
    v_variant_price_delta := null;
    v_variant_stock_override := null;
    v_unit_price := case
      when v_product.on_sale = true and v_product.sale_price is not null and v_product.sale_price >= 0
        then v_product.sale_price
      else v_product.price
    end;

    if v_item_variant_id is not null then
      select id, name, value, price_delta, stock_override
      into v_variant_id, v_variant_name, v_variant_value, v_variant_price_delta, v_variant_stock_override
      from public.product_variants
      where id = v_item_variant_id
        and product_id = v_product.id
        and is_active = true
      for update;

      if not found then
        raise exception 'Invalid product variant selected for %.', v_product.name;
      end if;

      v_unit_price := v_unit_price + coalesce(v_variant_price_delta, 0);

      update public.product_variants
      set stock_override = stock_override - v_qty
      where id = v_variant_id
        and stock_override is not null;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      variant_name,
      variant_value,
      product_name,
      sku,
      unit_price,
      quantity,
      line_total
    )
    values (
      v_order_id,
      v_product.id,
      v_variant_id,
      v_variant_name,
      v_variant_value,
      v_product.name,
      v_product.sku,
      v_unit_price,
      v_qty,
      v_unit_price * v_qty
    );

    update public.products
    set stock = stock - v_qty
    where id = v_product.id;

    insert into public.stock_movements (
      product_id,
      change_qty,
      reason,
      created_by
    )
    values (
      v_product.id,
      (v_qty * -1),
      'Order ' || v_order_no || ' COD checkout',
      auth.uid()
    );
  end loop;

  perform public.append_order_history(
    v_order_id,
    'pending',
    'Order placed',
    'Your order is waiting for store approval.'
  );

  return v_order_no;
end;
$$;

create or replace function public.customer_cancel_order(
  p_order_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and customer_id = auth.uid()
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order can only be cancelled before approval.';
  end if;

  update public.orders
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = coalesce(nullif(p_reason, ''), 'Cancelled by customer before approval'),
      updated_at = now()
  where id = p_order_id;

  perform public.restore_order_inventory(
    p_order_id,
    'Order ' || v_order.order_no || ' cancelled by customer'
  );

  perform public.append_order_history(
    p_order_id,
    'cancelled',
    'Order cancelled',
    coalesce(nullif(p_reason, ''), 'Cancelled by customer before approval')
  );

  return v_order.order_no;
end;
$$;

create or replace function public.customer_mark_order_completed(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and customer_id = auth.uid()
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'Only delivered orders can be marked as completed.';
  end if;

  v_deadline := greatest(
    coalesce(v_order.refund_override_until, '-infinity'::timestamptz),
    now() + interval '24 hours'
  );

  update public.orders
  set status = 'completed',
      completed_at = now(),
      payment_status = 'paid',
      refund_deadline_at = v_deadline,
      updated_at = now()
  where id = p_order_id;

  perform public.append_order_history(
    p_order_id,
    'completed',
    'Order completed',
    'Customer confirmed order received.'
  );
end;
$$;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_next_status public.order_status,
  p_note text default null,
  p_lat numeric default null,
  p_lng numeric default null
)
returns public.order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_deadline timestamptz;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if not public.can_transition_order(v_order.status, p_next_status) then
    raise exception 'Invalid status transition from % to %.', v_order.status, p_next_status;
  end if;

  if p_next_status = 'cancelled' and v_order.status not in ('cancelled', 'refunded', 'delivered', 'completed') then
    perform public.restore_order_inventory(
      p_order_id,
      'Order ' || v_order.order_no || ' cancelled by admin'
    );
  end if;

  if p_next_status = 'delivered' then
    v_deadline := greatest(
      coalesce(v_order.refund_override_until, '-infinity'::timestamptz),
      now() + interval '3 days'
    );
  elsif p_next_status = 'completed' then
    v_deadline := greatest(
      coalesce(v_order.refund_override_until, '-infinity'::timestamptz),
      now() + interval '24 hours'
    );
  else
    v_deadline := v_order.refund_deadline_at;
  end if;

  update public.orders
  set status = p_next_status,
      approved_at = case when p_next_status in ('approved', 'confirmed') and approved_at is null then now() else approved_at end,
      shipped_at = case when p_next_status = 'shipped' and shipped_at is null then now() else shipped_at end,
      delivered_at = case when p_next_status = 'delivered' and delivered_at is null then now() else delivered_at end,
      completed_at = case when p_next_status = 'completed' and completed_at is null then now() else completed_at end,
      cancelled_at = case when p_next_status = 'cancelled' then now() else cancelled_at end,
      cancelled_by = case when p_next_status = 'cancelled' then auth.uid() else cancelled_by end,
      cancel_reason = case when p_next_status = 'cancelled' then coalesce(nullif(p_note, ''), cancel_reason) else cancel_reason end,
      payment_status = case
        when p_next_status in ('delivered', 'completed') then 'paid'
        when p_next_status = 'refunded' then 'refunded'
        else payment_status
      end,
      refunded_at = case when p_next_status = 'refunded' then now() else refunded_at end,
      refund_deadline_at = v_deadline,
      latest_lat = coalesce(p_lat, latest_lat),
      latest_lng = coalesce(p_lng, latest_lng),
      updated_at = now()
  where id = p_order_id;

  perform public.append_order_history(
    p_order_id,
    p_next_status,
    public.order_status_title(p_next_status),
    nullif(p_note, ''),
    p_lat,
    p_lng
  );

  return p_next_status;
end;
$$;

create or replace function public.customer_request_refund(
  p_order_id uuid,
  p_reason text,
  p_note text default null,
  p_evidence_urls text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_deadline timestamptz;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Refund reason is required.';
  end if;

  if coalesce(array_length(p_evidence_urls, 1), 0) > 5 then
    raise exception 'Maximum of 5 refund evidence images is allowed.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and customer_id = auth.uid()
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status not in ('delivered', 'completed') then
    raise exception 'Refund is only available after delivery.';
  end if;

  v_deadline := coalesce(
    v_order.refund_override_until,
    v_order.refund_deadline_at,
    case
      when v_order.completed_at is not null then v_order.completed_at + interval '24 hours'
      when v_order.delivered_at is not null then v_order.delivered_at + interval '3 days'
      else null
    end
  );

  if v_deadline is null or now() > v_deadline then
    raise exception 'Refund window has expired.';
  end if;

  if exists (
    select 1
    from public.refund_requests rr
    where rr.order_id = p_order_id
      and rr.status = 'open'
  ) then
    raise exception 'Refund request already submitted for this order.';
  end if;

  insert into public.refund_requests (
    order_id,
    customer_id,
    status,
    reason,
    note,
    evidence_urls
  )
  values (
    p_order_id,
    auth.uid(),
    'open',
    btrim(p_reason),
    nullif(p_note, ''),
    coalesce(p_evidence_urls, '{}')
  )
  returning id into v_request_id;

  update public.orders
  set status = 'refund_requested',
      updated_at = now()
  where id = p_order_id;

  perform public.append_order_history(
    p_order_id,
    'refund_requested',
    'Refund requested',
    coalesce(nullif(p_note, ''), btrim(p_reason))
  );

  return v_request_id;
end;
$$;

create or replace function public.admin_resolve_refund(
  p_refund_request_id uuid,
  p_approve boolean,
  p_admin_note text default null
)
returns public.refund_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.refund_requests%rowtype;
  v_order public.orders%rowtype;
  v_result public.refund_status;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required.';
  end if;

  select *
  into v_request
  from public.refund_requests
  where id = p_refund_request_id
  for update;

  if not found then
    raise exception 'Refund request not found.';
  end if;

  if v_request.status <> 'open' then
    raise exception 'Refund request already resolved.';
  end if;

  select *
  into v_order
  from public.orders
  where id = v_request.order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if p_approve then
    v_result := 'approved';

    update public.refund_requests
    set status = 'approved',
        resolved_at = now(),
        resolved_by = auth.uid(),
        admin_note = nullif(p_admin_note, '')
    where id = v_request.id;

    update public.orders
    set status = 'refunded',
        payment_status = 'refunded',
        refunded_at = now(),
        updated_at = now()
    where id = v_request.order_id;

    perform public.append_order_history(
      v_request.order_id,
      'refunded',
      'Refund approved',
      coalesce(nullif(p_admin_note, ''), 'Refund request approved by admin.')
    );
  else
    v_result := 'rejected';

    update public.refund_requests
    set status = 'rejected',
        resolved_at = now(),
        resolved_by = auth.uid(),
        admin_note = nullif(p_admin_note, '')
    where id = v_request.id;

    update public.orders
    set status = case when v_order.completed_at is not null then 'completed' else 'delivered' end,
        updated_at = now()
    where id = v_request.order_id;

    perform public.append_order_history(
      v_request.order_id,
      case when v_order.completed_at is not null then 'completed' else 'delivered' end,
      'Refund request rejected',
      coalesce(nullif(p_admin_note, ''), 'Refund request rejected by admin.')
    );
  end if;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Views / seeds
-- -----------------------------------------------------------------------------
create or replace view public.v_monthly_category_sales as
select
  date_trunc('month', o.created_at) as month_bucket,
  c.name as category_name,
  sum(oi.line_total)::numeric(12,2) as sales_amount
from public.orders o
join public.order_items oi on oi.order_id = o.id
join public.products p on p.id = oi.product_id
join public.categories c on c.id = p.category_id
where o.payment_status = 'paid'
  and o.status in ('delivered', 'completed')
group by 1, 2;

create or replace view public.v_daily_sales as
select
  date_trunc('day', o.created_at) as day_bucket,
  count(*) as order_count,
  sum(o.total)::numeric(12,2) as gross_sales
from public.orders o
where o.payment_status = 'paid'
  and o.status in ('delivered', 'completed')
group by 1
order by 1 desc;

insert into public.shipping_methods (name, description, base_fee, eta_min_days, eta_max_days, is_active)
values
  ('J&T Express', 'Standard parcel shipping', 90, 1, 3, true),
  ('LBC Express', 'Nationwide courier service', 120, 2, 5, true),
  ('Suki Send Rider', 'Store-managed same day delivery', 35, 0, 1, true)
on conflict (name) do update
set
  description = excluded.description,
  base_fee = excluded.base_fee,
  eta_min_days = excluded.eta_min_days,
  eta_max_days = excluded.eta_max_days,
  is_active = excluded.is_active;

insert into public.app_settings (setting_key, setting_value, description)
values
  ('delivery_rate_per_km', '20', 'Distance fee rate per kilometer for rider checkout.')
on conflict (setting_key) do update
set
  setting_value = excluded.setting_value,
  description = excluded.description;

insert into public.product_images (product_id, image_url, sort_order)
select p.id, p.image_url, 0
from public.products p
where p.image_url is not null
  and not exists (
    select 1
    from public.product_images pi
    where pi.product_id = p.id
      and pi.image_url = p.image_url
  );

-- -----------------------------------------------------------------------------
-- RLS and policies
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.app_settings enable row level security;
alter table public.order_status_history enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.refund_requests enable row level security;
alter table public.product_reviews enable row level security;
alter table public.review_images enable row level security;
alter table public.rider_reviews enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles
for update
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read"
on public.categories
for select
using (true);

drop policy if exists "categories_admin_manage" on public.categories;
create policy "categories_admin_manage"
on public.categories
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "products_public_browse" on public.products;
create policy "products_public_browse"
on public.products
for select
using (is_active = true or public.is_admin(auth.uid()));

drop policy if exists "products_admin_manage" on public.products;
create policy "products_admin_manage"
on public.products
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "orders_customer_or_admin_select" on public.orders;
create policy "orders_customer_or_admin_select"
on public.orders
for select
using (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "orders_customer_insert" on public.orders;
create policy "orders_customer_insert"
on public.orders
for insert
with check (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update"
on public.orders
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "order_items_customer_or_admin_select" on public.order_items;
create policy "order_items_customer_or_admin_select"
on public.order_items
for select
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.customer_id = auth.uid()
  )
);

drop policy if exists "order_items_admin_manage" on public.order_items;
create policy "order_items_admin_manage"
on public.order_items
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "stock_movements_admin_select" on public.stock_movements;
create policy "stock_movements_admin_select"
on public.stock_movements
for select
using (public.is_admin(auth.uid()));

drop policy if exists "stock_movements_admin_insert" on public.stock_movements;
create policy "stock_movements_admin_insert"
on public.stock_movements
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "product_images_public_read" on public.product_images;
create policy "product_images_public_read"
on public.product_images
for select
using (true);

drop policy if exists "product_images_admin_manage" on public.product_images;
create policy "product_images_admin_manage"
on public.product_images
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "product_variants_public_read" on public.product_variants;
create policy "product_variants_public_read"
on public.product_variants
for select
using (is_active = true or public.is_admin(auth.uid()));

drop policy if exists "product_variants_admin_manage" on public.product_variants;
create policy "product_variants_admin_manage"
on public.product_variants
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "shipping_methods_public_read" on public.shipping_methods;
create policy "shipping_methods_public_read"
on public.shipping_methods
for select
using (is_active = true or public.is_admin(auth.uid()));

drop policy if exists "shipping_methods_admin_manage" on public.shipping_methods;
create policy "shipping_methods_admin_manage"
on public.shipping_methods
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
on public.app_settings
for select
using (true);

drop policy if exists "app_settings_admin_manage" on public.app_settings;
create policy "app_settings_admin_manage"
on public.app_settings
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "addresses_select_own_or_admin" on public.customer_addresses;
create policy "addresses_select_own_or_admin"
on public.customer_addresses
for select
using (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "addresses_insert_own" on public.customer_addresses;
create policy "addresses_insert_own"
on public.customer_addresses
for insert
with check (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "addresses_update_own_or_admin" on public.customer_addresses;
create policy "addresses_update_own_or_admin"
on public.customer_addresses
for update
using (customer_id = auth.uid() or public.is_admin(auth.uid()))
with check (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "addresses_delete_own_or_admin" on public.customer_addresses;
create policy "addresses_delete_own_or_admin"
on public.customer_addresses
for delete
using (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "order_history_customer_or_admin_select" on public.order_status_history;
create policy "order_history_customer_or_admin_select"
on public.order_status_history
for select
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.customer_id = auth.uid()
  )
);

drop policy if exists "wishlist_select_own" on public.wishlist_items;
create policy "wishlist_select_own"
on public.wishlist_items
for select
using (customer_id = auth.uid());

drop policy if exists "wishlist_insert_own" on public.wishlist_items;
create policy "wishlist_insert_own"
on public.wishlist_items
for insert
with check (customer_id = auth.uid());

drop policy if exists "wishlist_delete_own" on public.wishlist_items;
create policy "wishlist_delete_own"
on public.wishlist_items
for delete
using (customer_id = auth.uid());

drop policy if exists "refund_requests_select_own_or_admin" on public.refund_requests;
create policy "refund_requests_select_own_or_admin"
on public.refund_requests
for select
using (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "refund_requests_insert_own" on public.refund_requests;
create policy "refund_requests_insert_own"
on public.refund_requests
for insert
with check (customer_id = auth.uid());

drop policy if exists "refund_requests_admin_update" on public.refund_requests;
create policy "refund_requests_admin_update"
on public.refund_requests
for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "product_reviews_public_read" on public.product_reviews;
create policy "product_reviews_public_read"
on public.product_reviews
for select
using (true);

drop policy if exists "product_reviews_insert_own_after_delivery" on public.product_reviews;
create policy "product_reviews_insert_own_after_delivery"
on public.product_reviews
for insert
with check (
  customer_id = auth.uid()
  and exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_id
      and oi.product_id = product_id
      and o.id = order_id
      and o.customer_id = auth.uid()
      and o.status in ('delivered', 'completed')
  )
);

drop policy if exists "review_images_public_read" on public.review_images;
create policy "review_images_public_read"
on public.review_images
for select
using (true);

drop policy if exists "review_images_insert_review_owner" on public.review_images;
create policy "review_images_insert_review_owner"
on public.review_images
for insert
with check (
  exists (
    select 1
    from public.product_reviews r
    where r.id = review_id
      and r.customer_id = auth.uid()
  )
);

drop policy if exists "rider_reviews_public_read" on public.rider_reviews;
create policy "rider_reviews_public_read"
on public.rider_reviews
for select
using (true);

drop policy if exists "rider_reviews_insert_own_after_delivery" on public.rider_reviews;
create policy "rider_reviews_insert_own_after_delivery"
on public.rider_reviews
for insert
with check (
  customer_id = auth.uid()
  and exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.customer_id = auth.uid()
      and o.status in ('delivered', 'completed')
  )
);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
drop trigger if exists set_product_variants_updated_at on public.product_variants;
create trigger set_product_variants_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_addresses_updated_at on public.customer_addresses;
create trigger set_customer_addresses_updated_at
before update on public.customer_addresses
for each row execute function public.set_updated_at();

drop trigger if exists set_shipping_methods_updated_at on public.shipping_methods;
create trigger set_shipping_methods_updated_at
before update on public.shipping_methods
for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_product_reviews_updated_at on public.product_reviews;
create trigger set_product_reviews_updated_at
before update on public.product_reviews
for each row execute function public.set_updated_at();

drop trigger if exists customer_addresses_single_default on public.customer_addresses;
create trigger customer_addresses_single_default
before insert or update of is_default, customer_id on public.customer_addresses
for each row execute function public.ensure_single_default_address();

drop trigger if exists customer_addresses_promote_after_delete on public.customer_addresses;
create trigger customer_addresses_promote_after_delete
after delete on public.customer_addresses
for each row execute function public.promote_default_address_after_delete();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on table public.categories to anon, authenticated;
grant select on table public.products to anon, authenticated;
grant select on table public.app_settings to anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.orders to authenticated;
grant select on table public.order_items to authenticated;
grant select, insert on table public.stock_movements to authenticated;

grant select on table
  public.product_images,
  public.product_variants,
  public.customer_addresses,
  public.shipping_methods,
  public.order_status_history,
  public.wishlist_items,
  public.refund_requests,
  public.product_reviews,
  public.review_images,
  public.rider_reviews
to authenticated;

grant insert, update, delete on table public.product_images to authenticated;
grant insert, update, delete on table public.product_variants to authenticated;
grant insert, update, delete on table public.customer_addresses to authenticated;
grant insert, update, delete on table public.shipping_methods to authenticated;
grant insert, update, delete on table public.app_settings to authenticated;
grant insert, update, delete on table public.wishlist_items to authenticated;
grant insert, update on table public.refund_requests to authenticated;
grant insert on table public.product_reviews to authenticated;
grant insert, delete on table public.review_images to authenticated;
grant insert on table public.rider_reviews to authenticated;

grant execute on function public.create_cod_order(uuid, uuid, uuid, jsonb, text, numeric) to authenticated;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;
grant execute on function public.customer_mark_order_completed(uuid) to authenticated;
grant execute on function public.admin_update_order_status(uuid, public.order_status, text, numeric, numeric) to authenticated;
grant execute on function public.customer_request_refund(uuid, text, text, text[]) to authenticated;
grant execute on function public.admin_resolve_refund(uuid, boolean, text) to authenticated;

grant select on table public.v_monthly_category_sales to authenticated;
grant select on table public.v_daily_sales to authenticated;

-- -----------------------------------------------------------------------------
-- Storage buckets / policies for media
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-media', 'review-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_media_public_read" on storage.objects;
create policy "product_media_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-media');

drop policy if exists "product_media_admin_manage" on storage.objects;
create policy "product_media_admin_manage"
on storage.objects
for all
to authenticated
using (bucket_id = 'product-media' and public.is_admin(auth.uid()))
with check (bucket_id = 'product-media' and public.is_admin(auth.uid()));

drop policy if exists "review_media_public_read" on storage.objects;
create policy "review_media_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'review-media');

drop policy if exists "review_media_owner_upload" on storage.objects;
create policy "review_media_owner_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'review-media'
  and owner = auth.uid()
);

drop policy if exists "review_media_owner_delete" on storage.objects;
create policy "review_media_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'review-media'
  and (owner = auth.uid() or public.is_admin(auth.uid()))
);

-- -----------------------------------------------------------------------------
-- Chat seller + customer moderation
-- -----------------------------------------------------------------------------
create table if not exists public.seller_chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique(customer_id)
);

create table if not exists public.seller_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.seller_chat_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  message text not null check (char_length(btrim(message)) > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_restrictions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  severity text not null default 'restricted' check (severity in ('warning', 'restricted', 'banned')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_customer_actions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  action text not null,
  reason text,
  restriction_id uuid references public.customer_restrictions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_seller_chat_threads_customer on public.seller_chat_threads(customer_id);
create index if not exists idx_seller_chat_threads_last_message on public.seller_chat_threads(last_message_at desc);
create index if not exists idx_seller_chat_messages_thread_created on public.seller_chat_messages(thread_id, created_at desc);
create index if not exists idx_customer_restrictions_customer_active on public.customer_restrictions(customer_id, is_active, starts_at, ends_at);
create index if not exists idx_admin_customer_actions_customer on public.admin_customer_actions(customer_id, created_at desc);

create or replace function public.set_chat_thread_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.customer_active_restriction(
  p_customer_id uuid default auth.uid()
)
returns table (
  restriction_id uuid,
  reason text,
  severity text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.reason,
    r.severity,
    r.starts_at,
    r.ends_at
  from public.customer_restrictions r
  where r.customer_id = p_customer_id
    and r.is_active = true
    and r.starts_at <= now()
    and (r.ends_at is null or r.ends_at > now())
  order by
    case r.severity
      when 'banned' then 3
      when 'restricted' then 2
      else 1
    end desc,
    r.created_at desc
  limit 1;
$$;

create or replace function public.enforce_customer_order_restriction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restriction record;
  v_until text;
begin
  select *
  into v_restriction
  from public.customer_active_restriction(new.customer_id)
  where severity in ('restricted', 'banned')
  limit 1;

  if found then
    v_until := case
      when v_restriction.ends_at is null then 'permanently'
      else 'until ' || to_char(v_restriction.ends_at, 'Mon DD, YYYY HH24:MI')
    end;
    raise exception 'Ordering is currently restricted (%). %', v_until, v_restriction.reason;
  end if;

  return new;
end;
$$;

create or replace function public.get_or_create_seller_thread(
  p_customer_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_customer_id is null then
    raise exception 'Customer id is required.';
  end if;

  if auth.uid() <> p_customer_id and not public.is_admin(auth.uid()) then
    raise exception 'Not allowed to access this thread.';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_customer_id and p.role = 'customer'
  ) then
    raise exception 'Customer profile not found.';
  end if;

  insert into public.seller_chat_threads (customer_id)
  values (p_customer_id)
  on conflict (customer_id) do update
  set updated_at = now()
  returning id into v_thread_id;

  return v_thread_id;
end;
$$;

create or replace function public.send_seller_message(
  p_thread_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.seller_chat_threads%rowtype;
  v_message_id uuid;
  v_sender_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_thread_id is null then
    raise exception 'Thread id is required.';
  end if;

  if p_message is null or btrim(p_message) = '' then
    raise exception 'Message is required.';
  end if;

  select *
  into v_thread
  from public.seller_chat_threads
  where id = p_thread_id;

  if not found then
    raise exception 'Thread not found.';
  end if;

  if auth.uid() <> v_thread.customer_id and not public.is_admin(auth.uid()) then
    raise exception 'Not allowed to send message in this thread.';
  end if;

  v_sender_role := case when public.is_admin(auth.uid()) then 'admin' else 'customer' end;

  insert into public.seller_chat_messages (
    thread_id,
    sender_id,
    sender_role,
    message
  )
  values (
    p_thread_id,
    auth.uid(),
    v_sender_role,
    btrim(p_message)
  )
  returning id into v_message_id;

  update public.seller_chat_threads
  set last_message_at = now(),
      updated_at = now()
  where id = p_thread_id;

  return v_message_id;
end;
$$;

create or replace function public.mark_seller_thread_read(
  p_thread_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.seller_chat_threads%rowtype;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_thread
  from public.seller_chat_threads
  where id = p_thread_id;

  if not found then
    raise exception 'Thread not found.';
  end if;

  v_is_admin := public.is_admin(auth.uid());
  if auth.uid() <> v_thread.customer_id and not v_is_admin then
    raise exception 'Not allowed to update this thread.';
  end if;

  update public.seller_chat_messages
  set is_read = true
  where thread_id = p_thread_id
    and sender_role = case when v_is_admin then 'customer' else 'admin' end;
end;
$$;

create or replace function public.admin_set_customer_restriction(
  p_customer_id uuid,
  p_reason text,
  p_duration_hours integer default null,
  p_until timestamptz default null,
  p_severity text default 'restricted'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restriction_id uuid;
  v_ends_at timestamptz;
  v_severity text;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required.';
  end if;

  if p_customer_id is null then
    raise exception 'Customer id is required.';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_customer_id and p.role = 'customer'
  ) then
    raise exception 'Customer profile not found.';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Restriction reason is required.';
  end if;

  v_severity := lower(coalesce(nullif(btrim(p_severity), ''), 'restricted'));
  if v_severity not in ('warning', 'restricted', 'banned') then
    raise exception 'Invalid severity.';
  end if;

  if v_severity = 'banned' then
    v_ends_at := null;
  else
    v_ends_at := coalesce(
      p_until,
      now() + make_interval(hours => greatest(coalesce(p_duration_hours, 24), 1))
    );
  end if;

  update public.customer_restrictions
  set is_active = false,
      updated_at = now()
  where customer_id = p_customer_id
    and is_active = true;

  insert into public.customer_restrictions (
    customer_id,
    reason,
    severity,
    starts_at,
    ends_at,
    is_active,
    created_by
  )
  values (
    p_customer_id,
    btrim(p_reason),
    v_severity,
    now(),
    v_ends_at,
    true,
    auth.uid()
  )
  returning id into v_restriction_id;

  insert into public.admin_customer_actions (
    customer_id,
    action,
    reason,
    restriction_id,
    created_by
  )
  values (
    p_customer_id,
    case when v_severity = 'warning' then 'warning' else 'restriction_set' end,
    btrim(p_reason),
    v_restriction_id,
    auth.uid()
  );

  return v_restriction_id;
end;
$$;

create or replace function public.admin_list_customers()
returns table (
  customer_id uuid,
  full_name text,
  email text,
  created_at timestamptz,
  total_orders bigint,
  pending_orders bigint,
  active_restriction_id uuid,
  active_restriction_reason text,
  active_restriction_severity text,
  active_restriction_starts_at timestamptz,
  active_restriction_ends_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id as customer_id,
    p.full_name,
    coalesce(u.email, '') as email,
    p.created_at,
    coalesce(order_stats.total_orders, 0) as total_orders,
    coalesce(order_stats.pending_orders, 0) as pending_orders,
    active.id as active_restriction_id,
    active.reason as active_restriction_reason,
    active.severity as active_restriction_severity,
    active.starts_at as active_restriction_starts_at,
    active.ends_at as active_restriction_ends_at
  from public.profiles p
  left join auth.users u
    on u.id = p.id
  left join lateral (
    select
      count(*)::bigint as total_orders,
      count(*) filter (where o.status in ('pending', 'approved', 'shipped', 'out_for_delivery'))::bigint as pending_orders
    from public.orders o
    where o.customer_id = p.id
  ) order_stats on true
  left join lateral (
    select r.id, r.reason, r.severity, r.starts_at, r.ends_at
    from public.customer_restrictions r
    where r.customer_id = p.id
      and r.is_active = true
      and r.starts_at <= now()
      and (r.ends_at is null or r.ends_at > now())
    order by
      case r.severity
        when 'banned' then 3
        when 'restricted' then 2
        else 1
      end desc,
      r.created_at desc
    limit 1
  ) active on true
  where p.role = 'customer'
  order by p.created_at desc;
$$;

create or replace function public.admin_list_seller_threads()
returns table (
  thread_id uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  last_message_at timestamptz,
  last_message text,
  unread_count bigint,
  is_closed boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    t.id as thread_id,
    t.customer_id,
    coalesce(p.full_name, 'Customer') as customer_name,
    coalesce(u.email, '') as customer_email,
    t.last_message_at,
    latest.message as last_message,
    coalesce(unread.unread_count, 0) as unread_count,
    t.is_closed
  from public.seller_chat_threads t
  join public.profiles p
    on p.id = t.customer_id
  left join auth.users u
    on u.id = t.customer_id
  left join lateral (
    select m.message
    from public.seller_chat_messages m
    where m.thread_id = t.id
    order by m.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as unread_count
    from public.seller_chat_messages m
    where m.thread_id = t.id
      and m.sender_role = 'customer'
      and m.is_read = false
  ) unread on true
  order by t.last_message_at desc, t.created_at desc;
$$;

create or replace function public.admin_lift_customer_restriction(
  p_restriction_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.customer_restrictions%rowtype;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required.';
  end if;

  select *
  into v_target
  from public.customer_restrictions
  where id = p_restriction_id
  for update;

  if not found then
    raise exception 'Restriction not found.';
  end if;

  update public.customer_restrictions
  set is_active = false,
      ends_at = coalesce(least(coalesce(ends_at, now()), now()), now()),
      updated_at = now()
  where id = p_restriction_id;

  insert into public.admin_customer_actions (
    customer_id,
    action,
    reason,
    restriction_id,
    created_by
  )
  values (
    v_target.customer_id,
    'restriction_lifted',
    coalesce(nullif(btrim(p_reason), ''), 'Restriction lifted by admin'),
    p_restriction_id,
    auth.uid()
  );
end;
$$;

create or replace function public.admin_delete_customer_account(
  p_customer_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target_role text;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required.';
  end if;

  select role
  into v_target_role
  from public.profiles
  where id = p_customer_id;

  if not found then
    raise exception 'Customer profile not found.';
  end if;

  if v_target_role <> 'customer' then
    raise exception 'Only customer accounts can be removed here.';
  end if;

  insert into public.admin_customer_actions (
    customer_id,
    action,
    reason,
    created_by
  )
  values (
    p_customer_id,
    'account_deleted',
    coalesce(nullif(btrim(p_reason), ''), 'Account removed by admin'),
    auth.uid()
  );

  delete from auth.users where id = p_customer_id;
end;
$$;

alter table public.seller_chat_threads enable row level security;
alter table public.seller_chat_messages enable row level security;
alter table public.customer_restrictions enable row level security;
alter table public.admin_customer_actions enable row level security;

drop policy if exists "seller_chat_threads_select_participant_or_admin" on public.seller_chat_threads;
create policy "seller_chat_threads_select_participant_or_admin"
on public.seller_chat_threads
for select
using (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "seller_chat_threads_insert_participant_or_admin" on public.seller_chat_threads;
create policy "seller_chat_threads_insert_participant_or_admin"
on public.seller_chat_threads
for insert
with check (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "seller_chat_threads_update_participant_or_admin" on public.seller_chat_threads;
create policy "seller_chat_threads_update_participant_or_admin"
on public.seller_chat_threads
for update
using (customer_id = auth.uid() or public.is_admin(auth.uid()))
with check (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "seller_chat_messages_select_participant_or_admin" on public.seller_chat_messages;
create policy "seller_chat_messages_select_participant_or_admin"
on public.seller_chat_messages
for select
using (
  exists (
    select 1
    from public.seller_chat_threads t
    where t.id = thread_id
      and (t.customer_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists "seller_chat_messages_insert_participant_or_admin" on public.seller_chat_messages;
create policy "seller_chat_messages_insert_participant_or_admin"
on public.seller_chat_messages
for insert
with check (
  sender_id = auth.uid()
  and sender_role = case when public.is_admin(auth.uid()) then 'admin' else 'customer' end
  and exists (
    select 1
    from public.seller_chat_threads t
    where t.id = thread_id
      and (t.customer_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists "seller_chat_messages_update_participant_or_admin" on public.seller_chat_messages;
create policy "seller_chat_messages_update_participant_or_admin"
on public.seller_chat_messages
for update
using (
  exists (
    select 1
    from public.seller_chat_threads t
    where t.id = thread_id
      and (t.customer_id = auth.uid() or public.is_admin(auth.uid()))
  )
)
with check (
  exists (
    select 1
    from public.seller_chat_threads t
    where t.id = thread_id
      and (t.customer_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists "customer_restrictions_select_own_or_admin" on public.customer_restrictions;
create policy "customer_restrictions_select_own_or_admin"
on public.customer_restrictions
for select
using (customer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "customer_restrictions_admin_manage" on public.customer_restrictions;
create policy "customer_restrictions_admin_manage"
on public.customer_restrictions
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_customer_actions_admin_only" on public.admin_customer_actions;
create policy "admin_customer_actions_admin_only"
on public.admin_customer_actions
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop trigger if exists set_seller_chat_threads_updated_at on public.seller_chat_threads;
create trigger set_seller_chat_threads_updated_at
before update on public.seller_chat_threads
for each row execute function public.set_chat_thread_timestamp();

drop trigger if exists set_customer_restrictions_updated_at on public.customer_restrictions;
create trigger set_customer_restrictions_updated_at
before update on public.customer_restrictions
for each row execute function public.set_updated_at();

drop trigger if exists orders_block_restricted_customer on public.orders;
create trigger orders_block_restricted_customer
before insert on public.orders
for each row execute function public.enforce_customer_order_restriction();

grant select, insert, update on table public.seller_chat_threads to authenticated;
grant select, insert, update on table public.seller_chat_messages to authenticated;
grant select, insert, update, delete on table public.customer_restrictions to authenticated;
grant select, insert on table public.admin_customer_actions to authenticated;

grant execute on function public.customer_active_restriction(uuid) to authenticated;
grant execute on function public.get_or_create_seller_thread(uuid) to authenticated;
grant execute on function public.send_seller_message(uuid, text) to authenticated;
grant execute on function public.mark_seller_thread_read(uuid) to authenticated;
grant execute on function public.admin_set_customer_restriction(uuid, text, integer, timestamptz, text) to authenticated;
grant execute on function public.admin_lift_customer_restriction(uuid, text) to authenticated;
grant execute on function public.admin_delete_customer_account(uuid, text) to authenticated;
grant execute on function public.admin_list_customers() to authenticated;
grant execute on function public.admin_list_seller_threads() to authenticated;

-- -----------------------------------------------------------------------------
-- Rider role + live tracking
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'user_role') then
    execute 'alter type public.user_role add value if not exists ''rider''';
  end if;
exception when others then
  null;
end;
$$;

create or replace function public.is_rider(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role::text = 'rider'
  );
$$;

create or replace function public.rider_list_active_orders()
returns table (
  id uuid,
  order_no text,
  customer_id uuid,
  customer_name text,
  status public.order_status,
  payment_status public.payment_status,
  shipping_method_name text,
  delivery_area text,
  delivery_address text,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  latest_lat numeric,
  latest_lng numeric,
  created_at timestamptz,
  order_items_json jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_no,
    o.customer_id,
    coalesce(p.full_name, 'Customer') as customer_name,
    o.status,
    o.payment_status,
    o.shipping_method_name,
    o.delivery_area,
    o.delivery_address,
    o.subtotal,
    o.delivery_fee,
    o.total,
    o.latest_lat,
    o.latest_lng,
    o.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'variant_id', oi.variant_id,
            'variant_name', oi.variant_name,
            'variant_value', oi.variant_value,
            'product_name', oi.product_name,
            'product_image_url', prod.image_url,
            'sku', oi.sku,
            'unit_price', oi.unit_price,
            'quantity', oi.quantity,
            'line_total', oi.line_total
          )
          order by oi.created_at asc
        )
        from public.order_items oi
        left join public.products prod on prod.id = oi.product_id
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    ) as order_items_json
  from public.orders o
  left join public.profiles p on p.id = o.customer_id
  where o.status in ('approved', 'shipped', 'out_for_delivery')
  order by o.created_at desc;
$$;

create or replace function public.rider_update_order_progress(
  p_order_id uuid,
  p_next_status public.order_status default null,
  p_note text default null,
  p_lat numeric default null,
  p_lng numeric default null
)
returns public.order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_target_status public.order_status;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_admin(auth.uid()) and not public.is_rider(auth.uid()) then
    raise exception 'Rider access required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if p_next_status is not null then
    if p_next_status not in ('shipped', 'out_for_delivery', 'delivered') then
      raise exception 'Rider can only set shipped, out_for_delivery, or delivered.';
    end if;

    if not public.can_transition_order(v_order.status, p_next_status) then
      raise exception 'Invalid status transition from % to %.', v_order.status, p_next_status;
    end if;

    v_target_status := p_next_status;
    v_note := coalesce(nullif(p_note, ''), public.order_status_title(v_target_status));

    update public.orders
    set
      status = v_target_status,
      shipped_at = case when v_target_status = 'shipped' and shipped_at is null then now() else shipped_at end,
      delivered_at = case when v_target_status = 'delivered' and delivered_at is null then now() else delivered_at end,
      payment_status = case when v_target_status = 'delivered' then 'paid' else payment_status end,
      latest_lat = coalesce(p_lat, latest_lat),
      latest_lng = coalesce(p_lng, latest_lng),
      updated_at = now()
    where id = p_order_id;

    perform public.append_order_history(
      p_order_id,
      v_target_status,
      public.order_status_title(v_target_status),
      v_note,
      p_lat,
      p_lng
    );

    return v_target_status;
  end if;

  update public.orders
  set
    latest_lat = coalesce(p_lat, latest_lat),
    latest_lng = coalesce(p_lng, latest_lng),
    updated_at = now()
  where id = p_order_id;

  perform public.append_order_history(
    p_order_id,
    v_order.status,
    'Rider location update',
    coalesce(nullif(p_note, ''), 'Location ping from rider'),
    p_lat,
    p_lng
  );

  return v_order.status;
end;
$$;

grant execute on function public.is_rider(uuid) to authenticated;
grant execute on function public.rider_list_active_orders() to authenticated;
grant execute on function public.rider_update_order_progress(uuid, public.order_status, text, numeric, numeric) to authenticated;

-- Promote your first admin account after signup:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'your-admin@email.com');
