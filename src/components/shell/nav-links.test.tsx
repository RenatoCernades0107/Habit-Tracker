// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import navEn from "@messages/en/nav.json";
import navEs from "@messages/es/nav.json";

import { isActivePath } from "./nav-items";
import { NavLinks } from "./nav-links";

const navigation = vi.hoisted(() => ({ pathname: "/today" as string | null }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => navigation.pathname,
}));

afterEach(cleanup);

function renderNav(variant: "tabs" | "sidebar", locale: "en" | "es" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ nav: locale === "en" ? navEn : navEs }}>
      <nav aria-label="Main">
        <NavLinks variant={variant} />
      </nav>
    </NextIntlClientProvider>,
  );
}

describe("isActivePath", () => {
  it("matches the tab and its nested screens only", () => {
    expect(isActivePath("/habits", "/habits")).toBe(true);
    expect(isActivePath("/habits/new", "/habits")).toBe(true);
    expect(isActivePath("/habitsx", "/habits")).toBe(false);
    expect(isActivePath("/", "/today")).toBe(false);
    expect(isActivePath(null, "/today")).toBe(false);
  });
});

describe("NavLinks", () => {
  it.each(["tabs", "sidebar"] as const)(
    "lists the four screens in order and marks the current one (%s)",
    (variant) => {
      navigation.pathname = "/stats";
      renderNav(variant);

      const links = within(screen.getByRole("navigation")).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/today",
        "/habits",
        "/stats",
        "/settings",
      ]);
      expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
      for (const name of ["Today", "Habits", "Settings"]) {
        expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
      }
    },
  );

  it("keeps Settings current on its sub-pages", () => {
    navigation.pathname = "/settings/notifications";
    renderNav("tabs");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("marks nothing on a screen outside the tabs", () => {
    navigation.pathname = "/routine/123";
    renderNav("sidebar");
    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("is translated", () => {
    navigation.pathname = "/today";
    renderNav("tabs", "es");
    expect(screen.getByRole("link", { name: "Hoy" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/settings");
  });
});
