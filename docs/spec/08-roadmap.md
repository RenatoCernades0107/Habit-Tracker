# 08 · Roadmap

Every phase ends with something usable. Requirement IDs come from [01 · Product](01-product.md).

## Phases

### Phase 0 — Foundations and spikes

- Next.js (TypeScript strict, App Router), Tailwind, shadcn/ui, next-intl (es/en), ESLint, Prettier, Vitest, Playwright.
- Supabase project with the CLI; first migration (`profiles` and the signup trigger); pgTAP test setup.
- Sign-in with email code and Google; session middleware.
- PWA shell: manifest, icons, service worker, install guide.
- GitHub Actions CI, Vercel previews, staging Supabase project.
- Spikes **S1–S6** (below).

**Done when:** a signed-in user sees an empty Today in the installed iPhone app in both languages, and CI is green.

### Phase 1 — Core tracking

`FR-ACC-1…4, 6` · `FR-HAB-1…7` · `FR-RTN-1, 2, 4` · `FR-CHK-1…8` · `FR-TOD-1…7` · `FR-PWA-1…3` · `FR-I18N-1…5`

- Full schema for habits, routines, categories, versions, pauses and check-ins, with RLS.
- `apply_check_in_op`, undo, and the event log.
- Local-first data layer: IndexedDB cache, offline queue, delta sync, Realtime.
- Today, habit list, editor, templates.

**Done when:** a user creates habits from templates and logs, skips, undoes and logs past days, offline and online; two devices stay in sync live; NFR-PERF-1…3 are met on a mid-range phone.

### Phase 2 — Motivation and insights

`FR-STK-1…6` · `FR-STA-1…7` · `FR-RMD-1…4` · `FR-REV-1…4` · `FR-DAT-1, 2` · `FR-ACC-5`

- `src/domain` streaks and scores, with all examples from doc 02 as tests.
- Stats screens, habit detail, routine mode, celebrations, weekly review, export, account deletion.

**Done when:** the domain test suite passes, and stats render in ≤ 100 ms with a year of data.

### Phase 3 — Notifications

`FR-NTF-1…12` · `FR-RTN-3`

- Push subscriptions per device, tick (`pg_cron` → `/api/internal/tick`), planner, dispatcher, suppression, digests, daily report, weekly review, quiet hours, mute, snooze, badge, notification buttons.
- **Start Google OAuth verification paperwork** in parallel (privacy policy, terms, domain).

**Done when:** on iPhone, Android and desktop, reminders arrive within a minute of their time; done habits don't get reminders; digests and reports are correct in both languages; DST tests pass.

### Phase 4 — Siri and Shortcuts

`FR-SIR-1…9`

- API tokens, `/api/v1` endpoints, voice matching, `speech` texts in both languages.
- Four shortcuts in Spanish and English, published as iCloud links; in-app guide with screenshots.

**Done when:** "Hey Siri, log habit" logs the habit and speaks the result in ≤ 6 s; undo and summary work; the open app updates live.

### Phase 5 — Apple Health

`FR-HLT-1…7`

- `/api/v1/health`, Health rules, "Verified by Health" badges, last-sync warnings, automation guide.

**Done when:** the brief's two examples work end to end: 5,000 steps completes the habit by itself, and workouts on Mon/Tue/Thu/Fri are verified.

### Phase 6 — Google Calendar

`FR-CAL-1…7`

- OAuth connection, the app's own calendar, recurring events, marking days done, pauses, schedule changes, reconnect flow.

**Done when:** synced habits appear as recurring events; a Siri check-in marks that day's event ✅ within seconds; changing a schedule keeps past events.

### Phase 7 — Launch

`FR-DAT-3`

- Google OAuth verification approved.
- Performance, accessibility and security reviews against NFRs.
- Custom domain, custom SMTP, error tracking, paid Vercel and Supabase plans.

## Technical spikes

Do these in Phase 0. Each is small and answers one question before the design depends on it.

| ID | Question | Pass criteria | If it fails |
|---|---|---|---|
| S1 | Do the email code and Google sign-in both end with a session **inside** the installed iPhone app? | Both work on the current iOS version | Google sign-in only in the browser; email code in the app |
| S2 | Does the full push chain work on iPhone: `pg_cron` → tick → `web-push` → notification + badge? | 20 test reminders arrive on time | Core feature: fix before continuing |
| S3 | Shortcuts and Health: do step totals match the Health app (iPhone + Watch)? Can workouts and sleep be read? Does it work while the phone is locked? | Totals within 1% over 7 days | Drop the metric, or use exercise minutes for "workout days" |
| S4 | Can a shortcut be installed from an iCloud link with an Import Question for the token, and does *Choose from List* with a dictionary work by voice? | A fresh iPhone installs it and logs by voice | Manual token-paste step |
| S5 | Which service-worker tooling works with the current Next.js bundler (Serwist or hand-written)? | Offline cold start works | Hand-written `public/sw.js` |
| S6 | With `calendar.app.created`: create a calendar, a recurring event, patch one instance, set `EXDATE` | A test script does all four | Broader Calendar scope, with a clear explanation to users |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Apple changes PWA behavior (push, storage) | Notifications or offline break | Spikes; a device checklist for every major iOS version; features degrade gracefully |
| Health reads fail while locked or are inaccurate | Health checks unreliable | Several automations a day, today + yesterday backfill, last-sync warnings, manual check-ins always win |
| Google verification is slow or rejected | Calendar limited to 100 test users who reconnect weekly | Start in Phase 3; smallest possible scope; clear privacy policy |
| Free plans: Vercel Hobby is non-commercial; Supabase Free has limits and pauses | Terms-of-service or uptime problems | Paid plans before a public launch |
| Push delivery isn't guaranteed | Missed reminders | Daily report as a safety net; device status in Settings |
| Bugs in local-first sync | Wrong data | Server is the source of truth; op log and idempotency; multi-device end-to-end tests |
| Large scope | Slow delivery | Each phase ships on its own and is usable |

## Open questions

1. **Name and domain.** Needed for Google verification, email and the privacy policy.
2. **Free or paid product?** Decides the Vercel and Supabase plans.
3. **Fallback language** for browsers that are neither Spanish nor English. Proposed: English.
4. **Edit window:** is 7 days a good default?
5. **Skip limits:** should skips be limited (e.g. 4 per habit per month)? Proposed: unlimited, but visible in stats.
6. **Expected users in the first months.** Google allows 100 test users until verification.
