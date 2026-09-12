-- Run this BEFORE the v2 upgrade schema to allow return type changes.
-- PostgreSQL cannot CREATE OR REPLACE a function if the return type changes.

-- Chat inbox pagination functions (added avatar_url, contact_number columns)
DROP FUNCTION IF EXISTS public.admin_list_seller_threads();
DROP FUNCTION IF EXISTS public.admin_list_seller_threads_paginated(integer, integer, text);

-- Customer moderation functions (added avatar_url, contact_number columns)
DROP FUNCTION IF EXISTS public.admin_list_customers();
DROP FUNCTION IF EXISTS public.admin_list_customers_paginated(integer, integer, text);
