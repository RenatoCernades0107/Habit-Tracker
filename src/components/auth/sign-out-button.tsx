"use client";

import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition, type ComponentProps } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { signOut, signOutEverywhere } from "@/lib/auth/actions";
import { clearPageCaches } from "@/lib/pwa/sw-client";
import { cn } from "@/lib/utils";

import { isNextNavigation } from "./is-next-navigation";

type ButtonProps = Omit<ComponentProps<typeof Button>, "onClick" | "children" | "type">;

/**
 * "Sign out" (this device) or, with `everywhere`, "Sign out of all devices" (FR-ACC-6).
 * Both end on /login. For the account section of Settings.
 */
export function SignOutButton({
  everywhere = false,
  variant = "outline",
  className,
  ...props
}: ButtonProps & { everywhere?: boolean }) {
  const t = useTranslations("auth.signOut");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending) return;
    startTransition(async () => {
      try {
        // Cached pages may contain this user's data (public/sw.js CLEAR_CACHES).
        await clearPageCaches();
        await (everywhere ? signOutEverywhere() : signOut());
      } catch (error) {
        if (isNextNavigation(error)) return; // Redirecting to /login.
        toast.error(everywhere ? t("everywhereFailed") : tCommon("errors.generic"));
      }
    });
  }

  const Icon = isPending ? Loader2 : everywhere ? MonitorSmartphone : LogOut;
  const label = everywhere
    ? isPending
      ? t("everywhereSubmitting")
      : t("everywhere")
    : isPending
      ? t("submitting")
      : t("submit");

  return (
    <Button
      type="button"
      variant={variant}
      aria-disabled={isPending || undefined}
      onClick={handleClick}
      className={cn("aria-disabled:cursor-wait aria-disabled:opacity-70", className)}
      {...props}
    >
      <Icon className={isPending ? "animate-spin" : undefined} aria-hidden="true" />
      {label}
    </Button>
  );
}
