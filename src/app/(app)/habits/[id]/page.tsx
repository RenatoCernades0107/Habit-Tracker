import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { HabitDetail } from "@/components/habits/habit-detail";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats");
  return { title: t("title") };
}

/** Habit detail (FR-STA-2). The habit's name comes from the device cache, so it's the h1 there. */
export default async function HabitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/habits/${id}`);
  return (
    <div className="lg:max-w-4xl">
      <HabitDetail habitId={id} />
    </div>
  );
}
