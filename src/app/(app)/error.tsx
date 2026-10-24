"use client";

import { ErrorScreen } from "@/components/shell/error-screen";

/** Errors inside the signed-in screens keep the shell, so the tabs still work. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
