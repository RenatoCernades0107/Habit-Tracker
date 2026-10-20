import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PushSettings } from "@/components/push/push-settings";
import { InstallGuide } from "@/components/pwa/install-guide";
import { CategoriesSetting } from "@/components/settings/categories-setting";
import { DaysSetting } from "@/components/settings/days-setting";
import { LanguageSetting } from "@/components/settings/language-setting";
import { RoutinesSetting } from "@/components/settings/routines-setting";
import { ScrollToHash } from "@/components/settings/scroll-to-hash";
import { sectionHeadingId, SettingsSection } from "@/components/settings/settings-section";
import { ThemeSetting } from "@/components/settings/theme-setting";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

/**
 * Settings, Phase 0 (FR-ACC-3, FR-I18N-1, docs/spec/07-ux.md §4.8). Section ids are link
 * targets: Today's setup checklist opens #install and #notifications.
 */
export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const [t, supabase] = await Promise.all([getTranslations("settings"), createClient()]);

  // RLS returns only this user's row. Only what the page shows is selected.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.warn("[settings] profile not loaded:", error.code);
  const displayName = profile?.display_name?.trim();

  return (
    <div className="grid gap-6 lg:max-w-3xl">
      <ScrollToHash />
      <PageHeader title={t("title")} />

      <SettingsSection
        id="profile"
        title={t("profile.title")}
        description={t("profile.description")}
      >
        <dl className="grid gap-4 text-sm">
          {displayName ? (
            <div className="grid gap-1">
              <dt className="text-muted-foreground">{t("profile.name")}</dt>
              <dd className="font-medium">{displayName}</dd>
            </div>
          ) : null}
          <div className="grid gap-1">
            <dt className="text-muted-foreground">{t("profile.email")}</dt>
            <dd className="font-medium break-all">{user.email}</dd>
          </div>
        </dl>
      </SettingsSection>

      <SettingsSection
        id="language"
        title={t("language.title")}
        description={t("language.description")}
      >
        <LanguageSetting labelledBy={sectionHeadingId("language")} />
      </SettingsSection>

      <SettingsSection id="theme" title={t("theme.title")} description={t("theme.description")}>
        <ThemeSetting labelledBy={sectionHeadingId("theme")} userId={user.id} />
      </SettingsSection>

      <SettingsSection
        id="routines"
        title={t("routines.title")}
        description={t("routines.description")}
      >
        <RoutinesSetting />
      </SettingsSection>

      <SettingsSection
        id="categories"
        title={t("categories.title")}
        description={t("categories.description")}
      >
        <CategoriesSetting />
      </SettingsSection>

      <SettingsSection id="days" title={t("days.title")} description={t("days.description")}>
        <DaysSetting />
      </SettingsSection>

      <SettingsSection
        id="install"
        title={t("install.title")}
        description={t("install.description")}
      >
        <InstallGuide />
      </SettingsSection>

      <SettingsSection
        id="notifications"
        title={t("notifications.title")}
        description={t("notifications.description")}
      >
        <PushSettings />
      </SettingsSection>

      <SettingsSection
        id="account"
        title={t("account.title")}
        description={t("account.description")}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <SignOutButton />
          <SignOutButton everywhere variant="ghost" />
        </div>
      </SettingsSection>
    </div>
  );
}
