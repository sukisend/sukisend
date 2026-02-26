-- Add editable category icon support.
-- Run this once in Supabase SQL Editor.

alter table if exists public.categories
add column if not exists icon text;
