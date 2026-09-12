-- Banners table for home screen slideshow
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS)

CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  link_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banners_active ON banners (is_active, sort_order);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON banners TO authenticated;

DROP POLICY IF EXISTS "Public can view active banners" ON banners;
CREATE POLICY "Public can view active banners"
  ON banners FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage banners" ON banners;
CREATE POLICY "Admins can manage banners"
  ON banners FOR ALL
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS set_banners_updated_at ON banners;
CREATE TRIGGER set_banners_updated_at
  BEFORE UPDATE ON banners
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('banner-media', 'banner-media', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view banner images" ON storage.objects;
CREATE POLICY "Public can view banner images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'banner-media');

DROP POLICY IF EXISTS "Admins can upload banner images" ON storage.objects;
CREATE POLICY "Admins can upload banner images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'banner-media' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete banner images" ON storage.objects;
CREATE POLICY "Admins can delete banner images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'banner-media' AND public.is_admin(auth.uid()));
