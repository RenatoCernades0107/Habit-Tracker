"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Toasts (e.g. Undo, "Update available"). Announced to screen readers by sonner. */
function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      // Keep toasts above the bottom tab bar and the iPhone home indicator.
      offset={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
