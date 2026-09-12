-- Case-sensitive coupon validation
-- Customers must type the exact code (including capitalization)

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
  select *
  into v_coupon
  from public.coupons
  where code = trim(p_code)
    and is_active = true;

  if not found then
    return jsonb_build_object('valid', false, 'error', 'Invalid coupon code.');
  end if;

  if v_coupon.expires_at is not null and now() > v_coupon.expires_at then
    return jsonb_build_object('valid', false, 'error', 'This coupon has expired.');
  end if;

  if v_coupon.starts_at is not null and now() < v_coupon.starts_at then
    return jsonb_build_object('valid', false, 'error', 'This coupon is not yet active.');
  end if;

  if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
    return jsonb_build_object('valid', false, 'error', 'This coupon has reached its usage limit.');
  end if;

  if p_subtotal < v_coupon.min_order then
    return jsonb_build_object(
      'valid', false,
      'error', 'Minimum order of ' || to_char(v_coupon.min_order, 'FM999,999.00') || ' PHP required.'
    );
  end if;

  select exists(
    select 1 from public.coupon_usages
    where coupon_id = v_coupon.id and customer_id = p_customer_id
  ) into v_already_used;

  if v_already_used then
    return jsonb_build_object('valid', false, 'error', 'You have already used this coupon.');
  end if;

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
