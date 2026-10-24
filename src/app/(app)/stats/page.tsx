import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/page-header";
import { StatsView } from "@/components/stats/stats-view";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats");
  return { title: t("title") };
}

/** Statistics (FR-STA), computed on the device from local data. */
export default async function StatsPage() {
  await requireUser("/stats");
  const t = await getTranslations("stats");

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} />
      <StatsView />
    </div>
  );
}
