@AGENTS.md

# Restart

A habit-tracker PWA: Next.js 16 (App Router) on Vercel + Supabase. The spec in `docs/spec/` is the source of truth; requirement IDs (`FR-…`, `R-…`, `NFR-…`) are referenced in code comments and tests.

## Commands

- `npm run dev`: app on http://localhost:3000 (needs `.env.local`, see `.env.example`)
- `npm run check`: lint, typecheck, i18n key check, unit tests
- `npm run build`, `npm run test:e2e` (Playwright; set `PW_CHROMIUM_EXECUTABLE` to use a preinstalled Chromium)
- `npm run db:start` / `db:reset` / `db:test` / `db:types`: local Supabase (Docker), migrations, pgTAP tests, type generation

## Conventions

- `cacheComponents` is off on purpose (see `next.config.ts`).
- Middleware is `src/proxy.ts` (Next 16 renamed it). Read `node_modules/next/dist/docs/` before using a Next API you haven't checked.
- UI text never lives in components: add keys to `messages/en/<namespace>.json` **and** `messages/es/<namespace>.json` (same keys, same ICU arguments). New namespaces must be listed in `src/i18n/messages.ts` and `src/i18n/types.ts`.
- Spanish uses *tú*. English is the fallback language.
- UI primitives in `src/components/ui/` follow shadcn/ui (Radix). The shadcn registry is unreachable from some environments; write components by hand in the same style.
- Database changes go in a **new** file in `supabase/migrations/`; never edit a migration that has been pushed. Every table has RLS enabled and pgTAP tests in `supabase/tests/`. Run `npm run db:types` afterwards.
- Server-only code imports `server-only`. The secret-key client (`src/lib/supabase/admin.ts`) bypasses RLS: only use it in server jobs and token-authenticated APIs, always filtering by user.
- Environment variables are read through `src/lib/env.ts` (public) and `src/lib/env.server.ts` (secrets).
