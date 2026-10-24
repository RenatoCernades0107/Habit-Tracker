import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { RoutineMode } from "@/components/routine/routine-mode";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats.routine");
  return { title: t("start") };
}

/** Routine mode (FR-RMD), drawn full screen over the app shell. */
export default async function RoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/routine/${id}`);
  return <RoutineMode routineId={id} />;
}
