-- Add image_url column to product_variants for per-variant images
-- Safe to re-run (uses IF NOT EXISTS)

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN product_variants.image_url IS 'Optional image for this variant (e.g. color swatch, size visual). Displayed to customers when selecting variants.';
