-- Fix: Recreate handle_new_user() trigger with ALL profile columns.
-- Run this in Supabase SQL Editor to fix "Database error saving new user".

-- 1. Ensure all columns exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text unique,
  ADD COLUMN IF NOT EXISTS sitio text default '',
  ADD COLUMN IF NOT EXISTS barangay text default '',
  ADD COLUMN IF NOT EXISTS municipality text default '',
  ADD COLUMN IF NOT EXISTS province text default '',
  ADD COLUMN IF NOT EXISTS secret_question text default '',
  ADD COLUMN IF NOT EXISTS secret_answer text default '',
  ADD COLUMN IF NOT EXISTS avatar_url text default '',
  ADD COLUMN IF NOT EXISTS contact_number text default '',
  ADD COLUMN IF NOT EXISTS birthdate date;

-- 2. Recreate the trigger with ALL columns
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, role, username,
    sitio, barangay, municipality, province,
    secret_question, secret_answer,
    contact_number, birthdate
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer'),
    COALESCE(NEW.raw_user_meta_data ->> 'username', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'sitio', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'barangay', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'municipality', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'province', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'secret_question', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'secret_answer', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'contact_number', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'birthdate', '')::date
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
