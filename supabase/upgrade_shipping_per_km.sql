-- Change shipping from flat rate to per-km rate
-- Adds rate_per_km column, sets default ₱15/km, and migrates existing flat_rate data

-- Add rate_per_km column
ALTER TABLE public.shipping_methods
  ADD COLUMN IF NOT EXISTS rate_per_km numeric(12,2) NOT NULL DEFAULT 15.00;

-- Migrate existing base_fee to rate_per_km for active methods
-- (base_fee is treated as the per-km rate going forward)
UPDATE public.shipping_methods
SET rate_per_km = base_fee
WHERE base_fee > 0 AND rate_per_km = 15.00;

-- Add a minimum fee column for base/catchment fee
ALTER TABLE public.shipping_methods
  ADD COLUMN IF NOT EXISTS base_fee numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.shipping_methods.base_fee IS 'Base/catchment fee (fixed)';
COMMENT ON COLUMN public.shipping_methods.rate_per_km IS 'Rate charged per kilometer';
