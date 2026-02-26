# SUKI SEND POS Mobile

Android/iOS mobile POS application inspired by modern delivery app flows, customized for **SUKI SEND** with:

- Public store browsing before login
- Checkout gating (sign in required for buying)
- Private admin management flow
- Inventory, sales analytics, and COD order flow with approval lifecycle
- Sales analytics with report export (PDF and Excel/CSV)
- Light and dark mode support

## 1. Install and run

```bash
npm install
npm run start
```

Then launch Android/iOS from Expo.

## 2. Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env` and fill:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_SUPABASE_EMAIL_REDIRECT`
3. Open Supabase SQL editor and run:
   - [`supabase/schema.sql`](./supabase/schema.sql)
   - If your DB was already deployed before the latest update, run [`supabase/upgrade_address_rate.sql`](./supabase/upgrade_address_rate.sql) too.
   - Run [`supabase/upgrade_chat_moderation.sql`](./supabase/upgrade_chat_moderation.sql) for chat seller + customer moderation.
   - Run [`supabase/upgrade_rider_tracking.sql`](./supabase/upgrade_rider_tracking.sql) for rider role + live GPS delivery tracking.
   - If checkout RPC is outdated, run [`supabase/fix_checkout.sql`](./supabase/fix_checkout.sql).
4. For professional branded confirmation emails:
   - follow [`supabase/email-templates/README.md`](./supabase/email-templates/README.md)

## 3. Create admin accounts

New signups are created as `customer` by default.

Promote an existing user to admin with SQL:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_UUID_HERE';
```

Promote a rider account with SQL:

```sql
update public.profiles
set role = 'rider'
where id = 'USER_UUID_HERE';
```

## 4. What is implemented

### Customer side
- Onboarding and brand-first home flow
- Public product browsing
- Search + category filtering + product sorting
- Product details with quantity and optional variants
- Wishlist saved items
- Chat seller (customer-to-store conversation)
- Checkout requires login/signup
- COD order placement with shipping method and address book
- Customer order history with:
  - cancel before admin approval
  - tracking timeline + map
  - order received confirmation
  - product and rider reviews
  - refund request with photo attachments

### Admin side
- Dashboard metrics: gross sales, orders, average order, top seller
- Pending and outgoing order visibility
- Inventory monitoring: low stock and out of stock
- Product creation/editing/restocking with required fields:
  - product name
  - category (existing category selection supported)
  - unit
  - cost
  - price
  - stock and min stock
  - up to 20 optimized product images
- Recent transaction monitoring (COD)
- Order approval/cancel/status progression workflow
- Shipping method management (e.g. J&T, LBC with custom fees)
- Seller inbox with chat replies to customers
- Customer moderation tools:
  - warning / temporary restriction / permanent ban
  - restriction lift
  - account deletion
- Refund queue management (approve/reject)
- Reports screen with filters:
  - today, yesterday, week, month, year, 3 months, 6 months, custom date range
  - custom range uses in-app calendar picker
- Export report to:
  - PDF (professional template)
  - Excel-ready CSV

## 5. Notes

- If Supabase env vars are missing, app falls back to mock data so UI can still be tested.
- Your logo is wired from `assets/suki-send-logo.png` (generated from `store-logo/store-logo.webp`).
- Image upload pipeline uses WebP compression before upload for faster loading.
