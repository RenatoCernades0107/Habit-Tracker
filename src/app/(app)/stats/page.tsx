import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("stats") };
}

/** Placeholder until statistics arrive in Phase 2 (FR-STA). */
export default async function StatsPage() {
  await requireUser("/stats");
  const t = await getTranslations("nav");

  return (
    <div className="grid gap-6">
      <PageHeader title={t("stats")} />
      <EmptyState
        icon={ChartColumn}
        title={t("placeholder.stats.title")}
        description={t("placeholder.stats.description")}
      />
    </div>
  );
}
