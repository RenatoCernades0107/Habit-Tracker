# Habit Tracker — Specification

> **Status:** Draft v1 · **Last updated:** 2026-10-19
> **Source brief:** [`DESCRIPTION.md`](../../DESCRIPTION.md) (Spanish). This spec builds on it, fills the gaps found in review, and adds the features agreed on afterwards.

## Documents

| # | Document | Contents |
|---|---|---|
| 01 | [Product](01-product.md) | Goals, users, platforms, scope, functional and non-functional requirements |
| 02 | [Domain rules](02-domain-rules.md) | Exact rules for the habit day, schedules, scores, streaks, reminders and Health. The examples become unit tests |
| 03 | [Architecture](03-architecture.md) | System design, local-first client, scheduler, auth, i18n, PWA, performance budgets, security, repo layout, CI/CD |
| 04 | [Data model](04-data-model.md) | Postgres schema, Row Level Security, triggers, indexes, retention |
| 05 | [API](05-api.md) | Shortcuts API (`/api/v1`), app and internal endpoints, database RPCs |
| 06 | [Integrations](06-integrations.md) | Siri & Shortcuts, Apple Health, Google Calendar, Web Push |
| 07 | [UX](07-ux.md) | UX principles, navigation, screens, onboarding, visual design, accessibility |
| 08 | [Roadmap](08-roadmap.md) | Delivery phases, technical spikes, risks, open questions |

Requirement IDs (`FR-HAB-3`, `NFR-PERF-1`, `R-STREAK-2`, …) are stable. Use them in issues, PRs and test names.

## Key decisions

| ID | Decision | Why |
|---|---|---|
| D1 | **PWA only.** No native app, no App Store | No Apple Developer account needed. One codebase covers phone and desktop. |
| D2 | **iOS Shortcuts connect Siri and Apple Health** | A web app can't use Siri or HealthKit. Shortcuts can read Health data and call HTTPS APIs, and Siri runs any shortcut by its name. |
| D3 | **Next.js (App Router) on Vercel + Supabase** (Postgres, Auth, Realtime, Cron, Vault) | The chosen stack. |
| D4 | **Local-first client:** IndexedDB cache, optimistic writes, offline queue | The brief's "< 100 ms" can't be met if every view waits for the network. |
| D5 | **Web Push sent by the server**, triggered every minute by **Supabase `pg_cron`** | Browsers can't schedule local notifications. Vercel Cron on the Hobby plan only runs once a day. |
| D6 | **Google Calendar** (not iCloud) | Google has a REST API with OAuth and per-event updates. iCloud only offers CalDAV with app-specific passwords. |
| D7 | **Multi-user**, with Postgres Row Level Security (RLS) on every table | Many users from day one. |
| D8 | **Spanish and English** from day one (`next-intl`) | Requested. The default comes from the browser language. |
| D9 | **Email one-time code** as the main sign-in, plus Google | Apps on the iOS Home Screen don't share cookies with Safari, so a magic link would sign the user in to Safari instead of the app. |
| D10 | **One shared domain module** (`src/domain`) for schedules, scores and streaks | Stats in the app and numbers in notifications or Siri replies must always match. |

## Glossary

| Term | Meaning |
|---|---|
| **Habit** | Something the user wants to do regularly. Either *boolean* (done / not done) or *measurable* (a value against a target, e.g. 5,000 steps). |
| **Routine** | An ordered group of habits at a time of day: Morning, Evening, or a custom one. Each routine has a start time. |
| **Schedule** | When a habit is expected: every day, on specific weekdays, or N times per week (*flexible*). |
| **Habit day** | The user's day. It ends at `day_start_hour` (default 04:00) in their timezone, not at midnight. |
| **Occurrence** | One habit on one habit day. |
| **Check-in** | What happened to an occurrence: done, partial or skipped. |
| **Skip** | An excused miss (sick, travel, rest). It doesn't break a streak and isn't counted in the score. |
| **Pause** | A date range when a habit (or every habit, in "vacation mode") is not expected. |
| **Daily score** | The completion % of the day's fixed-schedule habits. |
| **Digest** | The notification sent at a routine's start time, listing its pending habits. |
| **Shortcut** | An Apple Shortcuts automation that calls this app's API. Siri runs it by name. |
