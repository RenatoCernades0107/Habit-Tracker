# Restart

A habit tracker for your phone and computer. Log habits by voice with Siri, get reminders only when you still need them, and see your progress. Apple Health can confirm some habits automatically, and habits can sync to Google Calendar.

A PWA built with **Next.js** and **Supabase**, deployed on **Vercel**, in Spanish and English. It's free and meant for a small private group.

## Status

**Phase 0 (foundations)** of the [roadmap](docs/spec/08-roadmap.md): sign-in with an email code or Google, the installable app shell, the service worker, the push notification chain and CI. Habit tracking starts in Phase 1.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 with shadcn/ui-style components · next-intl · Supabase (Postgres with Row Level Security, Auth, Realtime, `pg_cron`) · Web Push · Vitest · Playwright · pgTAP.

## Quick start

```bash
npm ci
npm run db:start            # local Supabase in Docker
cp .env.example .env.local  # then fill it in, see docs/setup.md
npm run dev                 # http://localhost:3000, sign-in codes arrive in Mailpit (http://127.0.0.1:54324)
```

Putting it online (Supabase project, Vercel, iPhone install) is covered step by step in [docs/setup.md](docs/setup.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run check` | Lint, typecheck, i18n key check, unit tests |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, port 3100). Set `PW_CHROMIUM_EXECUTABLE` to use an installed Chromium |
| `npm run format` | Prettier |
| `npm run db:start` / `db:stop` | Start or stop local Supabase |
| `npm run db:reset` | Rebuild the local database from the migrations |
| `npm run db:test` | pgTAP database tests |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` |
| `npm run icons` | Regenerate the app icons |

## Project structure

```
src/
  app/          routes: (auth)/login, (app)/today|habits|stats|settings, api/, offline
  components/   UI (ui/ = shadcn-style primitives)
  lib/          auth, supabase clients, push, pwa, env
  server/       server-only push sending and the scheduler tick
  i18n/         next-intl config and loaders
messages/       translations, one JSON file per namespace and language
public/sw.js    the service worker
supabase/       migrations, pgTAP tests, email template, local config
tests/e2e/      Playwright tests
docs/           spec/ (product and technical spec), spikes/, setup.md
```

## Documents

- [docs/spec/](docs/spec/README.md): the full specification.
- [docs/spikes/](docs/spikes/README.md): Phase 0 experiments and their results.
- [docs/setup.md](docs/setup.md): local development and deployment.
- [DESCRIPTION.md](DESCRIPTION.md): the original brief (Spanish).
