"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";

import { useData } from "@/data/hooks";
import { createClient } from "@/lib/supabase/client";

const DISMISSED_KEY = "restart:tz-dismissed";

/**
 * FR-ACC-4: when the device is in another timezone than the profile, ask once whether to
 * switch. New accounts still on UTC are updated silently.
 */
export function TimezonePrompt() {
  const t = useTranslations("today.timezone");
  const { data } = useData();
  const queryClient = useQueryClient();
  const asked = useRef(false);

  const profile = data.profile;
  useEffect(() => {
    if (!profile || asked.current) return;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device || device === profile.timezone) return;
    asked.current = true;

    const update = async () => {
      const { error } = await createClient()
        .from("profiles")
        .update({ timezone: device })
        .eq("id", profile.id);
      if (error) return;
      toast.success(t("updated"));
      void queryClient.invalidateQueries({ queryKey: ["snapshot"] });
    };

    if (profile.timezone === "UTC" && !profile.onboarding_completed_at) {
      void update();
      return;
    }
    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY);
    } catch {
      // Storage can be unavailable (private mode); then we just ask again next time.
    }
    if (dismissed === `${profile.timezone}>${device}`) return;

    toast(t("title"), {
      description: t("description", { device, current: profile.timezone }),
      duration: Infinity,
      action: { label: t("update", { device }), onClick: () => void update() },
      cancel: {
        label: t("keep", { current: profile.timezone }),
        onClick: () => {
          try {
            localStorage.setItem(DISMISSED_KEY, `${profile.timezone}>${device}`);
          } catch {
            // See above.
          }
        },
      },
    });
  }, [profile, queryClient, t]);

  return null;
}
