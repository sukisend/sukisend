-- Variant inventory is authoritative. Keep products.stock as the cached total
-- so list views and non-variant consumers always receive a reconciled value.
create or replace function public.sync_product_stock_from_variants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product_id uuid;
begin
  if tg_op = 'DELETE' then
    target_product_id := old.product_id;
  else
    target_product_id := new.product_id;
  end if;

  update public.products
  set stock = coalesce((
    select sum(stock_override)
    from public.product_variants
    where product_id = target_product_id
      and is_active = true
      and stock_override is not null
  ), 0)
  where id = target_product_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_product_stock_from_variants on public.product_variants;
create trigger sync_product_stock_from_variants
after insert or update or delete on public.product_variants
for each row execute function public.sync_product_stock_from_variants();

-- Correct existing totals such as a product total that no longer matches its variants.
update public.products product
set stock = totals.stock
from (
  select product_id, coalesce(sum(stock_override), 0)::integer as stock
  from public.product_variants
  where is_active = true and stock_override is not null
  group by product_id
) totals
where product.id = totals.product_id
  and product.stock is distinct from totals.stock;
