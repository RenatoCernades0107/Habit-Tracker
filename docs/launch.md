# Launch checklist (Phase 7)

Before sending the link to friends. Each item says where it's done; `docs/setup.md` has the
details of the first-time setup.

## 1. Sign-in emails: custom SMTP

Supabase's built-in email sends only a few messages an hour and is meant for testing.

1. Create a free [Resend](https://resend.com) account (or any SMTP provider) and verify a sending
   domain, or use Resend's test domain while trying it out.
2. Supabase → *Auth → SMTP Settings*: host `smtp.resend.com`, port `465`, user `resend`, the API
   key as the password, sender e.g. `Restart <hola@your-domain>`.
3. Supabase → *Auth → Rate Limits*: raise "emails per hour" to what the provider allows (e.g. 100).
4. Sign in from a phone and check the code arrives within a few seconds, in both languages.

## 2. Google OAuth in production (unverified)

Google Cloud Console → *OAuth consent screen*:

- Publishing status **In production**. Don't submit for verification: under 100 users it isn't
  needed ([Integrations §3.3](spec/06-integrations.md#33-verification-not-needed-for-restart)).
- Home page `https://<app>`, privacy policy `https://<app>/privacy`.
- Friends will see "Google hasn't verified this app" once: *Advanced → Go to Restart*. The
  Calendar settings say this too.

## 3. Custom domain (optional)

1. Vercel → *Project → Domains*: add the domain and set the DNS records it shows.
2. Update `NEXT_PUBLIC_APP_URL` in Vercel and redeploy.
3. Supabase → *Auth → URL Configuration*: site URL and redirect URLs with the new domain.
4. Google Cloud: add `https://<domain>/api/calendar/google/callback` as a redirect URI.
5. Vault: `select vault.update_secret((select id from vault.secrets where name = 'restart_app_url'), 'https://<domain>');`
6. Push subscriptions belong to the old origin: everyone turns notifications on again once.

## 4. Errors and logs

- Browser errors and crashes are sent to `/api/client-errors` and written to the Vercel logs as
  JSON lines with `"type":"client_error"` (no user data). Vercel → *Logs*, filter `client_error`.
- Server errors are in the same logs (`[tick]`, `[calendar]`, `[notifications]`, `[auth]`).
- Job tables keep their last error:

  ```sql
  select kind, status, suppressed_reason, count(*) from scheduled_notifications
   where send_at > now() - interval '1 day' group by 1, 2, 3 order by 1, 2;
  select op, status, last_error, count(*) from calendar_sync_jobs
   where created_at > now() - interval '1 day' group by 1, 2, 3;
  ```

- Want Sentry later? Add `@sentry/nextjs` and call it from `reportError` (`src/lib/errors/report.ts`).

## 5. Smoke test on real devices

- [ ] iPhone: install from Safari, sign in with a code inside the installed app (spike S1).
- [ ] Turn on notifications; "Send test in 1 minute" arrives with the app closed (spike S2).
- [ ] Create a habit with a time 10 minutes ahead: the reminder arrives; mark it done from the
      notification (Android or desktop) or from the app; no second reminder.
- [ ] Siri: build "Registrar hábito" / "Log habit" from `shortcuts/`, create a token, say it
      (spike S4).
- [ ] Health: "Sync Health" with steps; the walk completes by itself (spike S3).
- [ ] Google Calendar: connect, sync a habit with a time, log it with Siri, the event shows ✅
      within seconds (spike S6).
- [ ] Settings → Your data: export works; delete account on a test account.

## 6. Invite

Send the link to `/start` ("Getting started"): it explains installing, signing in, the first habit
and notifications, and links to `/privacy`.

## Known limits

- Sign-in runs on the server, so Supabase's per-IP auth limits see Vercel's addresses for
  everyone. With a handful of friends that's fine; raise *Auth → Rate Limits* if codes are refused.
- Free plans: Supabase pauses projects after a week without activity; daily use keeps it awake.
- Today loads about 300 KB of gzipped JavaScript, over the 170 KB budget (NFR-PERF-5): React and
  Next.js are about 105 KB and supabase-js about 67 KB of it. `npm run size` prints the breakdown,
  and CI fails above 320 KB so it can't grow unnoticed. Getting under budget means sending
  changes without supabase-js on the client (plain `fetch` to the RPCs) and loading Realtime
  after first paint.
