import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { HabitList } from "@/components/habits/habit-list";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("habits") };
}

/** The habit list (FR-HAB-4…6), rendered from the device cache. */
export default async function HabitsPage() {
  await requireUser("/habits");
  const t = await getTranslations("habits");

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between gap-4">
        <PageHeader title={t("title")} />
        <Button asChild>
          <Link href="/habits/new">
            <Plus aria-hidden="true" />
            {t("new")}
          </Link>
        </Button>
      </div>
      <HabitList />
    </div>
  );
}
