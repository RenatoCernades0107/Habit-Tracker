import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { WeeklyReview } from "@/components/review/weekly-review";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats.review");
  return { title: t("title") };
}

/** The weekly review of one week (FR-REV-2), e.g. /review/2026-10-12. */
export default async function WeekReviewPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  await requireUser(`/review/${week}`);
  return <WeeklyReview week={week} />;
}
