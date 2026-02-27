-- SUKI SEND - Chat media bucket upgrade (10MB max)
-- Run this in Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_media_public_read" on storage.objects;
create policy "chat_media_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'chat-media');

drop policy if exists "chat_media_owner_upload" on storage.objects;
create policy "chat_media_owner_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and owner = auth.uid()
);

drop policy if exists "chat_media_owner_delete" on storage.objects;
create policy "chat_media_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and (owner = auth.uid() or public.is_admin(auth.uid()))
);
