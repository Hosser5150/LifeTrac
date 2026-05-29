# LifeTrac

An interactive timeline, diary, task board, and calendar hub for personal life tracking.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Without Supabase env vars, LifeTrac runs in legacy local mode: the API runs on `http://127.0.0.1:4174`, and SQLite data plus uploaded images live under `data/`, which is intentionally ignored by Git.

To test the hosted data layer locally, create `.env` with:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
VITE_BASE_PATH=/
```

## What Is Included

- Timeline, diary feed, and calendar views.
- In-app create/edit/delete for memory items and life chunks.
- Flexible memory dates: exact day, month-level, or range.
- Life chunk membership by automatic date overlap.
- Local image uploads stored in `data/media` and referenced from SQLite.
- Markdown backup export with a readable template and embedded portable JSON payload.
- Unified month calendar hub with optional read-only Google Calendar sources.
- Hosted Supabase mode with Google sign-in, email allowlist gates, per-user records, private media storage, and Edge Function based Google Calendar sync.

## Hosted Supabase Setup

GitHub Pages can only serve the static Vite app, so hosted LifeTrac uses Supabase for auth, Postgres, Storage, Row Level Security, and privileged Edge Functions.

1. Create a fresh Supabase project.
2. Run `supabase/migrations/0001_hosted_auth_data.sql` in Supabase SQL Editor or with the Supabase CLI.
3. Add tester emails:

```sql
insert into public.tester_allowlist (email)
values ('you@example.com')
on conflict (email) do update set active = true;
```

4. In Supabase Auth, enable Google as a provider for login. Add redirect URLs for local and GitHub Pages:

```text
http://127.0.0.1:5173
https://<github-user>.github.io/<repo>/
```

5. Set Edge Function secrets:

```bash
supabase secrets set GOOGLE_CALENDAR_CLIENT_ID=...
supabase secrets set GOOGLE_CALENDAR_CLIENT_SECRET=...
supabase secrets set GOOGLE_CALENDAR_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/calendar-callback
supabase secrets set LIFETRAC_APP_ORIGIN=https://<github-user>.github.io/<repo>/
supabase secrets set SCHEDULED_SYNC_SECRET=<long-random-value>
```

6. Deploy Edge Functions:

```bash
supabase functions deploy calendar-auth-url
supabase functions deploy calendar-callback --no-verify-jwt
supabase functions deploy calendar-status
supabase functions deploy calendar-refresh-calendars
supabase functions deploy calendar-refresh-range
supabase functions deploy calendar-refresh-scheduled --no-verify-jwt
supabase functions deploy calendar-disconnect
```

7. In Google Cloud, add two redirect URIs:

```text
https://<project-ref>.supabase.co/auth/v1/callback
https://<project-ref>.supabase.co/functions/v1/calendar-callback
```

The first URI is for Supabase Google sign-in. The second URI is for the separate Google Calendar read-only connection.

8. For scheduled Calendar sync, copy `supabase/sql/calendar_cron_template.sql`, replace the placeholders, and run it in Supabase SQL Editor. It invokes the scheduled Edge Function every 30 minutes for connected testers.

## GitHub Pages Deployment

Set these GitHub repository variables:

```text
VITE_BASE_PATH=/<repo>/
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
```

The Pages workflow in `.github/workflows/deploy-pages.yml` runs typecheck, tests, build, then deploys `dist`.

## Connect Google Calendar Locally

The top calendar hub works with LifeTrac data immediately. To add your personal Google calendars, create a Google Cloud OAuth web client with the Google Calendar API enabled, then allow this local callback URL:

```text
http://127.0.0.1:4174/api/integrations/google/callback
```

Set credentials in the PowerShell session that starts LifeTrac:

```powershell
$env:GOOGLE_CALENDAR_CLIENT_ID="your-google-oauth-client-id"
$env:GOOGLE_CALENDAR_CLIENT_SECRET="your-google-oauth-client-secret"
npm run dev
```

Optional overrides are available if you change local ports:

```powershell
$env:GOOGLE_CALENDAR_REDIRECT_URI="http://127.0.0.1:4174/api/integrations/google/callback"
$env:LIFETRAC_APP_ORIGIN="http://127.0.0.1:5173"
```

Use `Connect Google` in the calendar hub after the server starts. LifeTrac stores OAuth tokens only in the local SQLite data folder and keeps imported Google events separate from memories and tasks.

## Useful Commands

```bash
npm test
npm run typecheck
npm run build
```
