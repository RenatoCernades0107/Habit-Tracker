import { getTranslations } from "next-intl/server";

/**
 * Shown while a tab's server render is on its way, so the tab bar responds at once.
 * Not a spinner (docs/spec/07-ux.md §1): a quiet outline of a page that only fades in
 * when loading takes longer than a moment, so fast navigations don't flash.
 */
export default async function AppLoading() {
  const t = await getTranslations("common");

  return (
    <div
      role="status"
      aria-busy="true"
      className="grid animate-in gap-6 delay-300 duration-300 fill-mode-both fade-in"
    >
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true" className="grid gap-2">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-8 w-56 max-w-full rounded-md bg-muted" />
      </div>
      <div aria-hidden="true" className="h-40 rounded-xl border bg-card" />
      <div aria-hidden="true" className="h-56 rounded-xl border border-dashed bg-card/50" />
    </div>
  );
}
