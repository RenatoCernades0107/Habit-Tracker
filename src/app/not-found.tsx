import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.notFound");
  return { title: t("metaTitle") };
}

/** Unknown URLs and `notFound()`. Signed-out visitors following the link go via sign-in. */
export default async function NotFound() {
  const t = await getTranslations("nav.notFound");

  return (
    <main id="main" className="flex min-h-dvh flex-col pt-safe pr-safe pb-safe pl-safe">
      <div className="m-auto w-full max-w-md px-4 py-12">
        <EmptyState
          headingLevel={1}
          icon={Compass}
          title={t("title")}
          description={t("description")}
          action={
            <Button asChild>
              <Link href="/today">{t("action")}</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
