# Supabase Email Branding (SUKI SEND)

Use this template in Supabase Dashboard:

1. Go to `Authentication > Email Templates`.
2. Open `Confirm signup`.
3. Subject:
   - `Confirm your SUKI SEND account`
4. Copy the full content of:
   - `confirm-signup.html`
5. Paste into Supabase template editor and save.

## Redirect URL after email confirmation

Your app is already set to send a redirect URL in code:

- env var: `EXPO_PUBLIC_SUPABASE_EMAIL_REDIRECT`
- current value in `.env`: `sukisend://auth/confirmed`

Also set allowed redirects in Supabase:

1. Go to `Authentication > URL Configuration`.
2. Add these to `Redirect URLs`:
   - `sukisend://auth/confirmed`
   - your production web success page (example): `https://yourdomain.com/account-confirmed`
3. Set `Site URL` to your production website root.

If you want confirmation to land on web first, change `.env`:

`EXPO_PUBLIC_SUPABASE_EMAIL_REDIRECT=https://yourdomain.com/account-confirmed`
