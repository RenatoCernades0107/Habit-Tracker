import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

type Section = { title: string; items: string[] };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.privacy");
  return { title: t("title") };
}

/** Privacy (FR-DAT-3): public, also linked from Google's consent screen. */
export default async function PrivacyPage() {
  const t = await getTranslations("pages.privacy");
  const sections = t.raw("sections") as Section[];
  return (
    <article className="grid w-full max-w-2xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("updated")}</p>
      </header>
      <p>{t("intro")}</p>
      {sections.map((s) => (
        <section key={s.title} className="grid gap-2">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <ul className="grid list-disc gap-1 pl-5 text-sm leading-relaxed">
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <p>
        <Link
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
      </p>
    </article>
  );
}
