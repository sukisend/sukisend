-- SUKI SEND - Coupon / Voucher System
-- Run this in Supabase SQL Editor.

-- -----------------------------------------------------------------------------
-- 1. coupons table
-- -----------------------------------------------------------------------------
create table if not exists public.coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  description   text default '',
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_order     numeric(12,2) not null default 0 check (min_order >= 0),
  max_discount  numeric(12,2) default null,
  usage_limit   integer default null check (usage_limit is null or usage_limit > 0),
  used_count    integer not null default 0,
  is_active     boolean not null default true,
  starts_at     timestamptz default null,
  expires_at    timestamptz default null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.coupons is 'Admin-managed coupon / voucher codes for customer discounts.';

-- index for fast code lookup
create index if not exists idx_coupons_code_lower on public.coupons (lower(code));

-- -----------------------------------------------------------------------------
-- 2. coupon_usages table (tracks who used what)
-- -----------------------------------------------------------------------------
create table if not exists public.coupon_usages (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  used_at     timestamptz not null default now(),
  unique (coupon_id, customer_id)
);

comment on table public.coupon_usages is 'Tracks one coupon use per customer.';

-- -----------------------------------------------------------------------------
-- 3. RLS policies
-- -----------------------------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.coupon_usages enable row level security;

-- Anyone authenticated can read active, valid coupons (for validation)
create policy "coupons_select_active" on public.coupons
  for select to authenticated
  using (is_active = true);

-- Only admins can manage coupons
create policy "coupons_admin_all" on public.coupons
  for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Customers can see their own usage history
create policy "coupon_usages_own" on public.coupon_usages
  for select to authenticated
  using (customer_id = auth.uid());

-- Customers can insert their own usage (after validation)
create policy "coupon_usages_insert_own" on public.coupon_usages
  for insert to authenticated
  with check (customer_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. Validate coupon function (server-side)
-- -----------------------------------------------------------------------------
create or replace function public.validate_coupon(
  p_code text,
  p_customer_id uuid,
  p_subtotal numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon record;
  v_already_used boolean;
  v_discount numeric(12,2);
begin
  -- Find coupon by code (exact, case-sensitive)
  select *
  into v_coupon
  from public.coupons
  where code = trim(p_code)
    and is_active = true;

  if not found then
    return jsonb_build_object('valid', false, 'error', 'Invalid coupon code.');
  end if;

  -- Check expiry
  if v_coupon.expires_at is not null and now() > v_coupon.expires_at then
    return jsonb_build_object('valid', false, 'error', 'This coupon has expired.');
  end if;

  -- Check start date
  if v_coupon.starts_at is not null and now() < v_coupon.starts_at then
    return jsonb_build_object('valid', false, 'error', 'This coupon is not yet active.');
  end if;

  -- Check usage limit
  if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
    return jsonb_build_object('valid', false, 'error', 'This coupon has reached its usage limit.');
  end if;

  -- Check minimum order
  if p_subtotal < v_coupon.min_order then
    return jsonb_build_object(
      'valid', false,
      'error', 'Minimum order of ' || to_char(v_coupon.min_order, 'FM999,999.00') || ' PHP required.'
    );
  end if;

  -- Check if customer already used this coupon
  select exists(
    select 1 from public.coupon_usages
    where coupon_id = v_coupon.id and customer_id = p_customer_id
  ) into v_already_used;

  if v_already_used then
    return jsonb_build_object('valid', false, 'error', 'You have already used this coupon.');
  end if;

  -- Calculate discount
  if v_coupon.discount_type = 'percent' then
    v_discount := (p_subtotal * v_coupon.discount_value / 100);
    if v_coupon.max_discount is not null then
      v_discount := least(v_discount, v_coupon.max_discount);
    end if;
  else
    v_discount := least(v_coupon.discount_value, p_subtotal);
  end if;

  return jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'description', v_coupon.description,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'discount_amount', v_discount,
    'max_discount', v_coupon.max_discount
  );
end;
$$;

grant execute on function public.validate_coupon(text, uuid, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Apply coupon function (records usage, increments counter)
-- -----------------------------------------------------------------------------
create or replace function public.apply_coupon(
  p_coupon_id uuid,
  p_customer_id uuid,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coupon_usages (coupon_id, customer_id, order_id)
  values (p_coupon_id, p_customer_id, p_order_id)
  on conflict (coupon_id, customer_id) do nothing;

  update public.coupons
  set used_count = used_count + 1
  where id = p_coupon_id;
end;
$$;

grant execute on function public.apply_coupon(uuid, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Seed sample coupons (optional — remove in production)
-- -----------------------------------------------------------------------------
insert into public.coupons (code, description, discount_type, discount_value, min_order, usage_limit, starts_at, expires_at)
values
  ('NEWUKI10', '10% off for new buyers', 'percent', 10, 0, 100, null, null),
  ('SUKILESS10', '₱10 off on orders over ₱1,000', 'fixed', 10, 1000, null, null, null)
on conflict (code) do nothing;
