-- SUKI SEND - Chat Seller + Customer Moderation Upgrade
-- Run this whole script in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Shared helpers / triggers
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- RPC functions for app workflow
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
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

-- Force PostgREST to refresh function signature cache.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end;
$$;
