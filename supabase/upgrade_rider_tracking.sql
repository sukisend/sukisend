-- SUKI SEND - Rider role + live tracking workflow upgrade
-- Run this whole script in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Ensure rider role exists
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'user_role') then
    execute 'alter type public.user_role add value if not exists ''rider''';
  end if;
exception when others then
  null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Rider order feed
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Rider progress / live location update
-- ---------------------------------------------------------------------------
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

  -- Location-only update
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

-- Force PostgREST cache refresh
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end;
$$;
