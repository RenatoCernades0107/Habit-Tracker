"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { setUserLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Compact ES / EN toggle. Saves the choice (cookie, and profile when signed in). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("auth.language");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(locale);

  function choose(next: Locale) {
    if (next === shown || isPending) return;
    startTransition(async () => {
      setShown(next);
      try {
        await setUserLocale(next);
        router.refresh();
      } catch {
        toast.error(tCommon("errors.generic"));
      }
    });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn("inline-flex rounded-lg border bg-card p-0.5 shadow-xs", className)}
    >
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={shown === option}
          aria-label={t(option)}
          onClick={() => choose(option)}
          className={cn(
            "inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none",
            "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-pressed:bg-secondary aria-pressed:text-secondary-foreground",
          )}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
