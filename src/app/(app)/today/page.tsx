import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { SetupChecklist } from "@/components/today/setup-checklist";
import { SETUP_HIDDEN_COOKIE } from "@/components/today/setup-items";
import { TodayView } from "@/components/today/today-view";
import { requireUser } from "@/lib/auth/session";
import { detectPlatform } from "@/lib/pwa/platform";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("today") };
}

/**
 * Today (FR-TOD-1…7). The habits render on the device from the local cache; the server only
 * decides the setup checklist, so it never flashes.
 */
export default async function TodayPage() {
  await requireUser("/today");
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  // From the user agent, so the checklist's items are right on the first render. iPadOS
  // in desktop mode reads as "desktop" here and simply doesn't get the iPhone-only items.
  const platform = detectPlatform(headerList.get("user-agent") ?? "");
  const showSetup = cookieStore.get(SETUP_HIDDEN_COOKIE)?.value !== "1";

  return (
    <Suspense>
      <TodayView setup={showSetup ? <SetupChecklist platform={platform} /> : null} />
    </Suspense>
  );
}
