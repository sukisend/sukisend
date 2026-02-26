-- SUKI SEND upgrade patch
-- Run this in Supabase SQL Editor if your project was created before Feb 26, 2026.

create extension if not exists pgcrypto;

alter table public.customer_addresses add column if not exists latitude numeric(10,7);
alter table public.customer_addresses add column if not exists longitude numeric(10,7);

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (setting_key, setting_value, description)
values
  ('delivery_rate_per_km', '20', 'Distance fee rate per kilometer for rider checkout.')
on conflict (setting_key) do update
set
  setting_value = excluded.setting_value,
  description = excluded.description;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
on public.app_settings
for select
using (true);

drop policy if exists "app_settings_admin_manage" on public.app_settings;
create policy "app_settings_admin_manage"
on public.app_settings
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

grant select on table public.app_settings to anon, authenticated;
grant insert, update, delete on table public.app_settings to authenticated;
