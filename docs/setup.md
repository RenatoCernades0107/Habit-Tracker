# Setup

How to run Restart on your computer, and how to put it online for yourself and your friends. Follow the parts in order the first time.

- [A. Local development](#a-local-development)
- [B. Supabase project](#b-supabase-project)
- [C. Vercel](#c-vercel)
- [D. Install on an iPhone](#d-install-on-an-iphone)
- [E. Troubleshooting](#e-troubleshooting)

## A. Local development

You need **Node 22** (see `.nvmrc`) and **Docker** running.

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Start the local Supabase stack (Postgres, Auth, REST, Realtime and Mailpit for emails):

   ```bash
   npm run db:start
   ```

   If Docker can't download images from `public.ecr.aws`, use Docker Hub instead:

   ```bash
   SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npm run db:start
   ```

   Migrations in `supabase/migrations/` are applied automatically. `npm run db:reset` rebuilds the database from scratch.

3. Create `.env.local` from the template:

   ```bash
   cp .env.example .env.local
   npx supabase status -o env
   ```

   Copy the values printed by the second command:

   | `.env.local` | From `supabase status -o env` |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY` |
   | `SUPABASE_SECRET_KEY` | `SECRET_KEY` |

   Then generate the push keys and the scheduler secret:

   ```bash
   npx web-push generate-vapid-keys   # → NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
   openssl rand -hex 32               # → CRON_SECRET
   ```

   Set `VAPID_SUBJECT` to `mailto:` plus your email.

4. Start the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, enter any email and click **Continue**. The sign-in code arrives in **Mailpit** at http://127.0.0.1:54324, not in a real inbox.

5. Checks before you push:

   ```bash
   npm run check        # lint, typecheck, i18n keys, unit tests
   npm run db:test      # pgTAP database tests
   npm run build && npm run test:e2e   # Playwright (starts the built app on port 3100)
   ```

   After changing a migration, run `npm run db:types` and commit `src/lib/supabase/database.types.ts`. CI fails if it's out of date.

> The service worker only runs in production builds. To try it with `npm run dev`, set `NEXT_PUBLIC_ENABLE_SW_IN_DEV=1`.

## B. Supabase project

1. **Create the project** at [supabase.com](https://supabase.com) on the **Free** plan. Pick the region closest to your users. You'll use the same region for Vercel functions (step C3).

2. **Push the database:**

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   The project ref is in the dashboard URL: `supabase.com/dashboard/project/<ref>`.

3. **API keys:** *Project Settings → API Keys*. Note the **publishable** key (`sb_publishable_…`) and the **secret** key (`sb_secret_…`). The secret key bypasses Row Level Security: keep it only in Vercel's server variables.

4. **Auth → URL Configuration:**
   - *Site URL*: `https://<your-app>.vercel.app` (your production URL).
   - *Redirect URLs*: `https://<your-app>.vercel.app/auth/callback` and, for preview deployments, `https://*-<your-vercel-team>.vercel.app/auth/callback`.

5. **Auth → Emails (templates):** Restart signs in with a 6-digit code, not a link. Open `supabase/templates/sign-in-code.html` and paste its HTML into **both** the *Magic Link* and the *Confirm signup* templates. For the subject of both, use the one in `supabase/config.toml` (`[auth.email.template.magic_link]`). It picks Spanish or English with a Go template on `.Data.locale`.

6. **Auth → Providers → Email:** enable it, set the **OTP length to 6** and the **OTP expiry to 600 seconds**.

7. **Custom SMTP (recommended):** Supabase's built-in email service only sends a few emails per hour and is meant for testing. Under *Auth → SMTP Settings*, connect a provider such as [Resend](https://resend.com) (its free tier is plenty for a group of friends).

8. **Google sign-in (optional):**
   1. In [Google Cloud Console](https://console.cloud.google.com), create a project, configure the OAuth consent screen (type *External*, app name **Restart**) and create an OAuth client of type **Web application**.
   2. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   3. In Supabase, *Auth → Providers → Google*: enable it and paste the client ID and secret.

9. **Scheduler (push notifications):** the migrations create two `pg_cron` jobs, `restart-tick` (every minute) and `restart-cleanup` (nightly). The tick needs two secrets in Supabase Vault. In *SQL Editor*, run:

   ```sql
   select vault.create_secret('https://<your-app>.vercel.app', 'restart_app_url');
   select vault.create_secret('<same value as CRON_SECRET>', 'restart_cron_secret');
   ```

   Check the jobs exist:

   ```sql
   select jobname, schedule from cron.job;
   ```

   If the jobs are missing, enable the **pg_cron** and **pg_net** extensions under *Database → Extensions* and run `npx supabase db push` again.

## C. Vercel

1. At [vercel.com](https://vercel.com) (Hobby plan), **Add New → Project** and import the GitHub repository. Vercel detects Next.js.

2. **Environment variables** (*Settings → Environment Variables*), for Production and Preview:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (B3) |
   | `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | From `npx web-push generate-vapid-keys` |
   | `SUPABASE_SECRET_KEY` | Secret key (B3) |
   | `CRON_SECRET` | `openssl rand -hex 32`, the same value as the Vault secret `restart_cron_secret` |
   | `VAPID_PRIVATE_KEY` | From the same `web-push` command |
   | `VAPID_SUBJECT` | `mailto:<your email>` |

   Generate production VAPID keys once and keep them: changing them invalidates every device's notifications.

3. **Function region:** *Settings → Functions → Function Region*: the region closest to your Supabase project.

4. **Deploy.** Then make sure `NEXT_PUBLIC_APP_URL`, the Supabase *Site URL* (B4) and the Vault secret `restart_app_url` (B9) all use the final production URL, and redeploy if you changed a variable.

## D. Install on an iPhone

1. Open your production URL in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open **Restart from the Home Screen icon** (not from Safari). Notifications on iPhone only work this way, on iOS 16.4 or later.
4. Sign in with your email and type the 6-digit code from the email.
5. **Settings → Notifications → Enable notifications**, allow them, then **Send test now**. Try **Send test in 1 minute** too, with the app closed: that one goes through the scheduler like a real reminder.

## E. Troubleshooting

**No sign-in email.**
- Locally, emails are in Mailpit (http://127.0.0.1:54324).
- In production, check *Auth → Logs* in Supabase. The built-in email service has a very low hourly limit: set up custom SMTP (B7).
- Sign-in runs on the server, so Supabase sees Vercel's IP address for every user. If many sign-ins fail with "too many attempts", raise the limits under *Auth → Rate Limits*.

**The code is rejected.** Codes expire after 10 minutes and only the latest one works. Request a new one.

**No test notification.**
- iPhone: the app must be opened from the Home Screen icon, on iOS 16.4+. Check *iPhone Settings → Notifications → Restart*.
- Check the Vercel logs for `/api/push/test` errors, for example missing VAPID variables.

**"Send test in 1 minute" never arrives** (the scheduler):

```sql
-- Did the cron job run?
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Did the tick request reach the app? (status_code 200 = yes, 401 = CRON_SECRET doesn't match Vault)
select status_code, content, created from net._http_response order by created desc limit 5;
-- What happened to the test?
select kind, status, suppressed_reason, last_error, send_at, sent_at from scheduled_notifications order by id desc limit 5;
```

Common causes: the Vault secrets are missing or `restart_app_url` points to the wrong URL, or `CRON_SECRET` in Vercel differs from `restart_cron_secret`.

**Supabase project paused.** Free projects pause after a period of inactivity. Restore it from the dashboard.
