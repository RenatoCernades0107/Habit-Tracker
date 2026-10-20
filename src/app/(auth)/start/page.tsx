import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

type Step = { title: string; body: string };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.start");
  return { title: t("title") };
}

/** "How to get started" (Phase 7): what to send to friends with the link. Public. */
export default async function StartPage() {
  const t = await getTranslations("pages.start");
  const steps = t.raw("steps") as Step[];
  return (
    <article className="grid w-full max-w-2xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <ol className="grid gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              {i + 1}
            </span>
            <div className="grid gap-1">
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="rounded-lg bg-muted px-4 py-3 text-sm">{t("tip")}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild size="lg">
          <Link href="/login">{t("cta")}</Link>
        </Button>
        <Link
          href="/privacy"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("privacy")}
        </Link>
      </div>
    </article>
  );
}
