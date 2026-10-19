import { unstable_rethrow } from "next/navigation";

/**
 * True for the errors Next.js uses to navigate (e.g. `redirect()` in a Server Action).
 * When a Server Action redirects, its promise rejects with one of these after the router
 * has already started the navigation, so callers should treat it as success, not failure.
 */
export function isNextNavigation(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}
