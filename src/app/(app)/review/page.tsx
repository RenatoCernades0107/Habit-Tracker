import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WeeklyReview } from "@/components/review/weekly-review";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats.review");
  return { title: t("title") };
}

/** The latest weekly review (FR-REV-2); the weekly notification opens this. */
export default async function ReviewPage() {
  await requireUser("/review");
  return <WeeklyReview week={null} />;
}
