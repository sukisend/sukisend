-- Remove default shipping methods that should not auto-return.
-- Run once in SQL editor.

delete from public.shipping_methods
where name in ('Suki Send Rider', 'J&T Express', 'LBC Express');
