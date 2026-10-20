import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { authErrorFromCallback } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { getUser } from "@/lib/auth/session";
import { BrandMark } from "@/components/pwa/brand-mark";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("metaTitle"), robots: { index: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** /login (FR-ACC-1). `?next=` is where to go afterwards; `?error=` comes from /auth/callback. */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));

  // The proxy already sends signed-in users away; this covers requests it didn't see.
  if (await getUser()) redirect(next);

  const [t, tPages] = await Promise.all([getTranslations("common"), getTranslations("pages")]);

  return (
    <div className="grid w-full max-w-sm gap-8">
      <div className="grid justify-items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <BrandMark className="size-8" />
        </span>
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t("appName")}</h1>
          <p className="text-muted-foreground">{t("tagline")}</p>
        </div>
      </div>
      <LoginForm next={next} initialError={authErrorFromCallback(first(params.error))} />
      <nav className="flex justify-center gap-4 text-sm text-muted-foreground">
        <Link href="/start" className="underline-offset-4 hover:underline">
          {tPages("start.title")}
        </Link>
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          {tPages("privacy.title")}
        </Link>
      </nav>
    </div>
  );
}
