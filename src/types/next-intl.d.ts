import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/types";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
