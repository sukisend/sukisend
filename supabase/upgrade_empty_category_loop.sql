-- Automated "empty" category lifecycle test loop.
-- Run once in Supabase SQL Editor.
--
-- Every 24 hours the job will:
--   1) create category "empty" when it does not exist
--   2) delete category "empty" when it already exists (only if no products use it)
--
-- This runs server-side with pg_cron, so no signed-in user is required.

create table if not exists public.category_automation_log (
  id bigserial primary key,
  action text not null check (action in ('created', 'deleted', 'skipped', 'error')),
  category_name text not null default 'empty',
  category_id uuid,
  details text,
  created_at timestamptz not null default now()
);

create or replace function public.toggle_empty_category_loop()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_product_count integer;
begin
  select id
  into v_category_id
  from public.categories
  where lower(name) = 'empty'
  limit 1;

  if v_category_id is null then
    insert into public.categories (name)
    values ('empty')
    returning id into v_category_id;

    insert into public.category_automation_log (action, category_id, details)
    values ('created', v_category_id, 'Category "empty" created by automation job.');

    return;
  end if;

  select count(*)
  into v_product_count
  from public.products
  where category_id = v_category_id;

  if v_product_count > 0 then
    insert into public.category_automation_log (action, category_id, details)
    values (
      'skipped',
      v_category_id,
      format('Category "empty" has %s linked product(s); delete skipped.', v_product_count)
    );
    return;
  end if;

  delete from public.categories
  where id = v_category_id;

  insert into public.category_automation_log (action, category_id, details)
  values ('deleted', v_category_id, 'Category "empty" deleted by automation job.');
exception
  when others then
    insert into public.category_automation_log (action, details)
    values ('error', sqlerrm);
    raise;
end;
$$;

revoke all on function public.toggle_empty_category_loop() from public;
grant execute on function public.toggle_empty_category_loop() to postgres, service_role;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'empty-category-loop';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'empty-category-loop',
    '0 0 * * *',
    $cron$select public.toggle_empty_category_loop();$cron$
  );
end;
$$;

-- Start the loop immediately (create "empty" now if missing).
select public.toggle_empty_category_loop();