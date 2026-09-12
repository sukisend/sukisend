-- Upgrade: Add username, address, and secret question fields to profiles
-- Run this in Supabase SQL Editor

-- Add new columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text unique,
  ADD COLUMN IF NOT EXISTS sitio text default '',
  ADD COLUMN IF NOT EXISTS barangay text default '',
  ADD COLUMN IF NOT EXISTS municipality text default '',
  ADD COLUMN IF NOT EXISTS province text default '',
  ADD COLUMN IF NOT EXISTS secret_question text default '';

-- Update the trigger function to include new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, username, sitio, barangay, municipality, province, secret_question)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1), 'Suki User'),
    'customer',
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1), ''),
    COALESCE(NEW.raw_user_meta_data ->> 'sitio', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'barangay', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'municipality', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'province', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'secret_question', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
