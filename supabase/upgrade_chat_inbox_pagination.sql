-- Adds server-side pagination for Admin Seller Inbox threads.
-- Run once in Supabase SQL editor.

create or replace function public.admin_list_seller_threads_paginated(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null
)
returns table (
  thread_id uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  last_message_at timestamptz,
  last_message text,
  unread_count bigint,
  is_closed boolean,
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
      t.id as thread_id,
      t.customer_id,
      coalesce(p.full_name, 'Customer') as customer_name,
      coalesce(u.email, '') as customer_email,
      t.last_message_at,
      latest.message as last_message,
      coalesce(unread.unread_count, 0)::bigint as unread_count,
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
    cross join normalized n
    where
      n.search_term is null
      or p.full_name ilike '%' || n.search_term || '%'
      or coalesce(u.email, '') ilike '%' || n.search_term || '%'
  ),
  counted as (
    select count(*)::bigint as total_count
    from filtered
  )
  select
    f.thread_id,
    f.customer_id,
    f.customer_name,
    f.customer_email,
    f.last_message_at,
    f.last_message,
    f.unread_count,
    f.is_closed,
    c.total_count
  from filtered f
  cross join counted c
  order by f.last_message_at desc
  limit (select page_size from normalized)
  offset ((select page_no from normalized) - 1) * (select page_size from normalized);
$$;

grant execute on function public.admin_list_seller_threads_paginated(integer, integer, text) to authenticated;
