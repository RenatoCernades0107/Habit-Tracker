import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewHabit } from "@/components/habits/habit-editor";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("habits");
  return { title: t("new") };
}

export default async function NewHabitPage() {
  await requireUser("/habits/new");
  const t = await getTranslations("habits");
  return (
    <div className="grid gap-6 lg:max-w-2xl">
      <PageHeader title={t("new")} />
      <Suspense>
        <NewHabit />
      </Suspense>
    </div>
  );
}
