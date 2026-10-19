import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("habits") };
}

/** Placeholder until the habit list and editor arrive in Phase 1 (FR-HAB). */
export default async function HabitsPage() {
  await requireUser("/habits");
  const t = await getTranslations("nav");

  return (
    <div className="grid gap-6">
      <PageHeader title={t("habits")} />
      <EmptyState
        icon={ListChecks}
        title={t("placeholder.habits.title")}
        description={t("placeholder.habits.description")}
      />
    </div>
  );
}
