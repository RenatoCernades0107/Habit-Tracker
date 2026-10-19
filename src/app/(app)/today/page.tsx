import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { getFormatter, getTimeZone, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { dateOfHabitDay, habitDay } from "@/components/today/habit-day";
import { RestIllustration } from "@/components/today/rest-illustration";
import { SetupChecklist } from "@/components/today/setup-checklist";
import { SETUP_HIDDEN_COOKIE } from "@/components/today/setup-items";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { detectPlatform } from "@/lib/pwa/platform";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("today") };
}

/**
 * Today, Phase 0: the habit day (FR-TOD-1), the setup checklist (FR-TOD-7) and the empty
 * state (FR-TOD-6). Habits, the score ring and the day switcher arrive in Phase 1.
 */
export default async function TodayPage() {
  await requireUser("/today");
  const [t, format, timeZone, cookieStore, headerList] = await Promise.all([
    getTranslations("today"),
    getFormatter(),
    getTimeZone(),
    cookies(),
    headers(),
  ]);

  const day = habitDay(new Date(), timeZone);
  // From the user agent, so the checklist's items are right on the first render. iPadOS
  // in desktop mode reads as "desktop" here and simply doesn't get the iPhone-only items.
  const platform = detectPlatform(headerList.get("user-agent") ?? "");
  const showSetup = cookieStore.get(SETUP_HIDDEN_COOKIE)?.value !== "1";

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={
          <time dateTime={day}>
            {format.dateTime(dateOfHabitDay(day), {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </time>
        }
      />

      {/* Phones: checklist first ("at the top", docs/spec/07-ux.md §4.1).
          Desktop: two columns, the day on the left and the checklist beside it. */}
      <div
        className={cn(
          "grid gap-6 lg:items-start",
          showSetup && "lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]",
        )}
      >
        {showSetup ? (
          <SetupChecklist platform={platform} className="lg:col-start-2 lg:row-start-1" />
        ) : null}
        <EmptyState
          className="lg:col-start-1 lg:row-start-1"
          illustration={<RestIllustration />}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button asChild size="lg">
              <Link href="/habits">
                <Plus aria-hidden="true" />
                {t("empty.action")}
              </Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
