"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

/** Light, dark or system theme, stored per device by next-themes. */
export function ThemeProvider(props: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
