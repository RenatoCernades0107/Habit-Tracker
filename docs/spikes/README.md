# Technical spikes (Phase 0)

Small experiments that answer one question each before later phases depend on the answer. The questions come from the [roadmap](../spec/08-roadmap.md#technical-spikes). Most need a real iPhone or a Google account, so they're run by hand with the protocols below.

| ID | Question | Status | Protocol | Result |
|---|---|---|---|---|
| S1 | Do the email code and Google sign-in both end with a session inside the installed iPhone app? | Ready to run on a device | [S1](S1-ios-auth.md) | — |
| S2 | Does the push chain work on iPhone: `pg_cron` → tick → `web-push` → notification + badge? | Harness built (Settings → Notifications); ready to run on a device | [S2](S2-push-chain.md) | — |
| S3 | Do Shortcuts read correct Health totals (steps, workouts, sleep), also while the phone is locked? | Ready to run on a device | [S3](S3-health-shortcuts.md) | — |
| S4 | Can a shortcut be installed from an iCloud link with an Import Question, and does *Choose from List* with a dictionary work by voice? | Sample data at `/spikes/s4-today.json`; ready to run on a device | [S4](S4-shortcuts-distribution.md) | — |
| S5 | Serwist or a hand-written service worker with the current Next.js bundler? | **Decided:** hand-written `public/sw.js` | [S5](S5-service-worker.md) | See the doc |
| S6 | Does `calendar.app.created` allow everything Restart needs, and do refresh tokens last more than 7 days for an unverified app? | Script ready (`scripts/spikes/s6-google-calendar.mjs`) | [S6](S6-google-calendar.md) | — |

When a spike is done, fill its results table, write the outcome in the **Result** column above, and update the spec if the answer changes a decision.
