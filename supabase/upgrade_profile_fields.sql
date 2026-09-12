-- Add profile fields: avatar_url, contact_number, birthdate
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text default '',
  ADD COLUMN IF NOT EXISTS contact_number text default '',
  ADD COLUMN IF NOT EXISTS birthdate date;

-- Update the trigger to capture new fields from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
begin
  insert into public.profiles (id, full_name, role, username, sitio, barangay, municipality, province, secret_question, secret_answer, contact_number, birthdate)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'customer'),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'sitio', ''),
    coalesce(new.raw_user_meta_data ->> 'barangay', ''),
    coalesce(new.raw_user_meta_data ->> 'municipality', ''),
    coalesce(new.raw_user_meta_data ->> 'province', ''),
    coalesce(new.raw_user_meta_data ->> 'secret_question', ''),
    coalesce(new.raw_user_meta_data ->> 'secret_answer', ''),
    coalesce(new.raw_user_meta_data ->> 'contact_number', ''),
    nullif(new.raw_user_meta_data ->> 'birthdate', '')::date
  );
  return new;
end;
$$;

-- Profile media storage bucket for avatar uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-media', 'profile-media', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for profile-media bucket
DROP POLICY IF EXISTS "Public read access for profile media" ON storage.objects;
CREATE POLICY "Public read access for profile media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-media');

DROP POLICY IF EXISTS "Authenticated users can upload profile media" ON storage.objects;
CREATE POLICY "Authenticated users can upload profile media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own profile media" ON storage.objects;
CREATE POLICY "Users can update their own profile media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own profile media" ON storage.objects;
CREATE POLICY "Users can delete their own profile media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-media' AND auth.uid()::text = (storage.foldername(name))[1]);
