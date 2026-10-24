"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { setUserLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";

import { SegmentedControl } from "./segmented-control";

/**
 * Español / English (FR-I18N-1). Saves the choice in the language cookie and the profile,
 * then re-renders the page on the server in the new language. Each name is shown in its
 * own language, so it's recognizable whatever the current one is.
 */
export function LanguageSetting({ labelledBy }: { labelledBy: string }) {
  const t = useTranslations("settings.language");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(locale);
  const [changedTo, setChangedTo] = useState<Locale | null>(null);

  function choose(next: Locale) {
    if (next === shown || isPending) return;
    startTransition(async () => {
      setShown(next);
      try {
        await setUserLocale(next);
        setChangedTo(next);
        router.refresh();
      } catch {
        toast.error(tCommon("errors.generic"));
      }
    });
  }

  return (
    <>
      <SegmentedControl
        labelledBy={labelledBy}
        value={shown}
        onChange={choose}
        busy={isPending}
        options={locales.map((option) => ({ value: option, label: t(option), lang: option }))}
      />
      {/* Announced once the page has re-rendered, so it's read in the new language. */}
      <p role="status" className="sr-only">
        {changedTo && !isPending ? t("changed", { language: t(changedTo) }) : null}
      </p>
    </>
  );
}
