import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/session";

/**
 * Signed-in screens. The proxy already sent signed-out visitors to /login; this check
 * covers what it can't see (e.g. a session revoked on another device, FR-ACC-6).
 * Layouts don't re-render on client navigation, so every page also calls `requireUser`
 * with its own path; both share one cached `getUser()` per request.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireUser();
  return <AppShell>{children}</AppShell>;
}
