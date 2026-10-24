# S2 · Push chain on iPhone

**Question:** does the full chain work on a real iPhone: `pg_cron` → `srv_tick_if_due()` → `/api/internal/tick` → `web-push` → notification and app badge?
**Pass criteria:** all 20 scheduled tests arrive, with a p95 delay under 90 seconds after the scheduled time.
**If it fails:** push is a core feature, so fix it before Phase 3.

## Prerequisites

- The app deployed ([setup](../setup.md)) with the VAPID variables and `CRON_SECRET` set in Vercel.
- Vault secrets `restart_app_url` and `restart_cron_secret` in Supabase (setup B9).
- An iPhone on iOS 16.4+, with Restart on the Home Screen and notifications enabled in **Settings → Notifications**.

## What the test buttons do

- **Send test now** sends right away, without the scheduler. It checks the device subscription and the VAPID keys.
- **Send test in 1 minute** inserts a row in `scheduled_notifications` (kind `test`). The next minute's `pg_cron` run sees it and calls the tick, which sends it. The body says when it was due and when it was sent. This is the real reminder path. At most 5 tests can be waiting.

## Steps

Do 20 scheduled tests spread over the conditions below. For each one, note when it was due and when it arrived (both times are in the notification body), and whether the badge appeared on the app icon.

| Condition | Tests |
|---|---|
| App open | 2 |
| App in background | 4 |
| App closed (swiped away) | 4 |
| Phone locked | 4 |
| Focus mode on (Restart allowed / not allowed) | 2 + 2 |
| Low Power Mode on | 2 |

## Results

| # | Condition | Due | Received | Delay | Badge? | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

## Debugging

```sql
select id, kind, status, suppressed_reason, attempts, last_error, send_at, sent_at
from scheduled_notifications order by id desc limit 20;
select status_code, created from net._http_response order by created desc limit 10;
select status, start_time from cron.job_run_details order by start_time desc limit 10;
```

- `status = suppressed`, `suppressed_reason = stale`: the tick ran more than 10 minutes late.
- `no_subscriptions`: the server has no push subscription for that user. Turn notifications off and on in Settings.
- `net._http_response.status_code = 401`: `CRON_SECRET` in Vercel doesn't match the Vault secret.
