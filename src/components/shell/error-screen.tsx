"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

import { EmptyState } from "./empty-state";

/** Server errors reach the client with a `digest` that matches the server logs. */
function digestOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const { digest } = error;
    if (typeof digest === "string" && digest !== "") return digest;
  }
  return undefined;
}

/**
 * Friendly fallback for `error.tsx` boundaries. `retry` re-fetches and re-renders the
 * segment (Next.js 16.3+; preferred over `reset`, which only re-renders).
 */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("nav.error");
  const digest = digestOf(error);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      headingLevel={1}
      icon={TriangleAlert}
      title={t("title")}
      description={t("description")}
      action={
        <>
          <Button type="button" onClick={() => retry()}>
            <RotateCcw aria-hidden="true" />
            {t("retry")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/today">{t("action")}</Link>
          </Button>
          {digest ? (
            <p className="w-full pt-1 font-mono text-xs text-muted-foreground">
              {t("code", { digest })}
            </p>
          ) : null}
        </>
      }
    />
  );
}
