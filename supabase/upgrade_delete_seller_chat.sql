-- Migration: admin_delete_seller_chat_thread
-- Adds an RPC to delete a seller chat thread and all its messages.

create or replace function public.admin_delete_seller_chat_thread(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.seller_chat_messages
  where thread_id = p_thread_id;

  delete from public.seller_chat_threads
  where id = p_thread_id;
end;
$$;

grant execute on function public.admin_delete_seller_chat_thread(uuid) to authenticated;
