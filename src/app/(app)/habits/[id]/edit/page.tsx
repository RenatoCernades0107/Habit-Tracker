import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { EditHabit } from "@/components/habits/habit-editor";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("habits");
  return { title: t("edit") };
}

export default async function EditHabitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/habits/${id}/edit`);
  const t = await getTranslations("habits");
  return (
    <div className="grid gap-6 lg:max-w-2xl">
      <PageHeader title={t("edit")} />
      <EditHabit habitId={id} />
    </div>
  );
}
