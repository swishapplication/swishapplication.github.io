# 🏀 Swish

A free app for booking our weekly basketball games: open it from the link, add it to your home screen, log in with your email.

**App:** https://bassemassaf03-code.github.io/hoop-squad/

## How it works
- **Website** (`index.html`, `app.js`, `style.css`) is hosted free on GitHub Pages.
- **Database, logins and game rules** live in Supabase (`supabase/migrations`).
- **Notifications** (email via Brevo + phone push) are sent by `supabase/functions/dispatch`.
- Every change pushed to `main` is published automatically by `.github/workflows/deploy.yml`.

## Secrets (Settings → Secrets and variables → Actions)
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `BREVO_API_KEY`, `BREVO_SMTP_KEY`, `BREVO_SMTP_LOGIN`, `SENDER_EMAIL`
