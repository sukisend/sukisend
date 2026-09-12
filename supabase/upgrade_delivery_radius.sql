-- Add delivery radius settings to app_settings.
-- Run this in Supabase SQL Editor.

-- Store location (latitude + longitude)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('store_latitude', '13.3592731')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('store_longitude', '120.6584527')
ON CONFLICT (setting_key) DO NOTHING;

-- Delivery radius in meters (default 15km = 15000m)
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('delivery_radius_meters', '15000')
ON CONFLICT (setting_key) DO NOTHING;
