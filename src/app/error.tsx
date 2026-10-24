"use client";

import { ErrorScreen } from "@/components/shell/error-screen";

/** Errors outside the signed-in shell (e.g. sign-in). The root layout still renders. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col pt-safe pr-safe pb-safe pl-safe">
      <div className="m-auto w-full max-w-md px-4 py-12">
        <ErrorScreen error={error} retry={retry} />
      </div>
    </main>
  );
}
