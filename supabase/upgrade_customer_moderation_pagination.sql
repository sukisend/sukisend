-- Adds server-side pagination for Admin Customer Moderation list.
-- Run once in Supabase SQL editor.

create or replace function public.admin_list_customers_paginated(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null
)
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
  active_restriction_ends_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with normalized as (
    select
      greatest(coalesce(p_page, 1), 1) as page_no,
      greatest(coalesce(p_page_size, 20), 1) as page_size,
      nullif(btrim(coalesce(p_search, '')), '') as search_term
  ),
  filtered as (
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
    cross join normalized n
    where p.role = 'customer'
      and (
        n.search_term is null
        or p.full_name ilike '%' || n.search_term || '%'
        or coalesce(u.email, '') ilike '%' || n.search_term || '%'
        or p.id::text ilike '%' || n.search_term || '%'
      )
  ),
  counted as (
    select count(*)::bigint as total_count
    from filtered
  )
  select
    f.customer_id,
    f.full_name,
    f.email,
    f.created_at,
    f.total_orders,
    f.pending_orders,
    f.active_restriction_id,
    f.active_restriction_reason,
    f.active_restriction_severity,
    f.active_restriction_starts_at,
    f.active_restriction_ends_at,
    c.total_count
  from filtered f
  cross join counted c
  order by f.created_at desc
  limit (select page_size from normalized)
  offset ((select page_no from normalized) - 1) * (select page_size from normalized);
$$;

grant execute on function public.admin_list_customers_paginated(integer, integer, text) to authenticated;
