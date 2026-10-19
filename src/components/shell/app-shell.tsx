import { getTranslations } from "next-intl/server";

import { BrandLink } from "./brand-link";
import { MAIN_ID } from "./constants";
import { NavLinks } from "./nav-links";

/**
 * Signed-in layout (docs/spec/07-ux.md §3, NFR-1): a bottom tab bar below 1024 px and a left
 * sidebar from 1024 px. Only one of the two navigations is rendered visible at a time, so
 * assistive technologies see a single "Main" navigation.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const [t, tCommon] = await Promise.all([getTranslations("nav"), getTranslations("common")]);

  return (
    <div className="flex min-h-dvh">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-md outline-none focus-visible:not-sr-only focus-visible:fixed focus-visible:top-[calc(env(safe-area-inset-top)+0.75rem)] focus-visible:left-4 focus-visible:z-50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {t("skipToContent")}
      </a>

      <aside
        data-shell="sidebar"
        className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r bg-card/60 pt-safe pb-safe pl-safe lg:block"
      >
        <div className="grid gap-6 px-3 py-6">
          <BrandLink name={tCommon("appName")} />
          <nav aria-label={t("label")}>
            <NavLinks variant="sidebar" />
          </nav>
        </div>
      </aside>

      {/* Phones: room at the bottom for the tab bar (4 rem) and the home indicator. */}
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="min-w-0 flex-1 pt-safe pr-safe pb-[calc(5rem+env(safe-area-inset-bottom))] pl-safe outline-none lg:pb-safe"
      >
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8 lg:max-w-5xl lg:px-10 lg:py-10">
          {children}
        </div>
      </main>

      <nav
        data-shell="tab-bar"
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pr-safe pb-safe pl-safe backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
      >
        <div className="mx-auto max-w-2xl px-2 py-1">
          <NavLinks variant="tabs" />
        </div>
      </nav>
    </div>
  );
}
