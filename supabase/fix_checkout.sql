-- FIX: create_cod_order "record v_variant is not assigned yet"
-- Run this whole script in the Supabase SQL Editor (same project as your EXPO_PUBLIC_SUPABASE_URL).
-- This version force-drops all create_cod_order overloads first, then recreates one safe function.

do $$
declare
  fn record;
begin
  for fn in
    select oidvectortypes(p.proargtypes) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_cod_order'
  loop
    execute format('drop function if exists public.create_cod_order(%s)', fn.args);
  end loop;
end;
$$;

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

  -- FIRST LOOP: Validation & subtotal
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
    v_unit_price := v_product.price;

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

      v_unit_price := v_product.price + coalesce(v_variant_price_delta, 0);
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  end loop;

  -- INSERT ORDER
  insert into public.orders (
    id, customer_id, status, payment_method, payment_status,
    shipping_method_id, shipping_method_name,
    delivery_area, delivery_address, customer_note,
    subtotal, delivery_fee, total,
    expected_delivery_start, expected_delivery_end
  )
  values (
    v_order_id, p_customer_id, 'pending', 'COD', 'unpaid',
    v_shipping.id, v_shipping.name,
    v_delivery_area, v_delivery_address, nullif(p_customer_note, ''),
    v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee,
    case when v_shipping.eta_min_days is not null then (now() + make_interval(days => v_shipping.eta_min_days))::date else null end,
    case when v_shipping.eta_max_days is not null then (now() + make_interval(days => v_shipping.eta_max_days))::date else null end
  )
  returning order_no into v_order_no;

  -- SECOND LOOP: Insert items + stock deduction
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
    v_unit_price := v_product.price;

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

      v_unit_price := v_product.price + coalesce(v_variant_price_delta, 0);

      update public.product_variants
      set stock_override = stock_override - v_qty
      where id = v_variant_id
        and stock_override is not null;
    end if;

    insert into public.order_items (
      order_id, product_id, variant_id, variant_name, variant_value,
      product_name, sku, unit_price, quantity, line_total
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

grant execute on function public.create_cod_order(uuid, uuid, uuid, jsonb, text, numeric) to authenticated;

-- Force PostgREST to refresh function signature cache immediately.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end;
$$;

-- Optional verification:
-- select oid::regprocedure as signature
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname = 'create_cod_order';
