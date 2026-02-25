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
  p_customer_note text default null
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
  v_variant record;
  v_unit_price numeric(12,2);
  v_address record;
  v_shipping record;
  v_delivery_area text;
  v_delivery_address text;
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

  v_delivery_fee := coalesce(v_shipping.base_fee, 0);
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

    v_unit_price := v_product.price;

    if nullif(v_item ->> 'variant_id', '') is not null then
      select *
      into v_variant
      from public.product_variants
      where id = (v_item ->> 'variant_id')::uuid
        and product_id = v_product.id
        and is_active = true
      for update;

      if not found then
        raise exception 'Invalid product variant selected for %.', v_product.name;
      end if;

      if v_variant.stock_override is not null and v_variant.stock_override < v_qty then
        raise exception 'Not enough stock for variant % (%).', v_variant.name, v_variant.value;
      end if;

      v_unit_price := v_product.price + coalesce(v_variant.price_delta, 0);
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

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    v_variant := null;
    v_unit_price := v_product.price;

    if nullif(v_item ->> 'variant_id', '') is not null then
      select *
      into v_variant
      from public.product_variants
      where id = (v_item ->> 'variant_id')::uuid
        and product_id = v_product.id
      for update;

      v_unit_price := v_product.price + coalesce(v_variant.price_delta, 0);

      update public.product_variants
      set stock_override = stock_override - v_qty
      where id = v_variant.id
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
      v_variant.id,
      v_variant.name,
      v_variant.value,
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
grant insert, update, delete on table public.wishlist_items to authenticated;
grant insert, update on table public.refund_requests to authenticated;
grant insert on table public.product_reviews to authenticated;
grant insert, delete on table public.review_images to authenticated;
grant insert on table public.rider_reviews to authenticated;

grant execute on function public.create_cod_order(uuid, uuid, uuid, jsonb, text) to authenticated;
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

-- Promote your first admin account after signup:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'your-admin@email.com');
