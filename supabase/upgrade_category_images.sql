-- Add image_url support for categories.
-- Run this once in Supabase SQL Editor.

alter table if exists public.categories
add column if not exists image_url text;
