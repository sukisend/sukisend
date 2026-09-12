-- Fix: admin_delete_customer_account foreign key constraint
-- Anonymize profile instead of hard delete to avoid orders FK violation

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

  update public.profiles
  set
    full_name = 'Deleted User',
    avatar_url = null,
    contact_number = null,
    updated_at = now()
  where id = p_customer_id;

  delete from public.seller_chat_threads where customer_id = p_customer_id;
end;
$$;
