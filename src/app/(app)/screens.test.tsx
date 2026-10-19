// @vitest-environment jsdom
/**
 * Renders the server-rendered screens with the request APIs mocked (session, cookies,
 * headers, next-intl/server), to check what each screen puts on the page.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/shell/app-shell";
import authEn from "@messages/en/auth.json";
import commonEn from "@messages/en/common.json";
import navEn from "@messages/en/nav.json";
import settingsEn from "@messages/en/settings.json";
import todayEn from "@messages/en/today.json";
import commonEs from "@messages/es/common.json";
import navEs from "@messages/es/nav.json";
import settingsEs from "@messages/es/settings.json";
import todayEs from "@messages/es/today.json";

import RootError from "../error";
import NotFound from "../not-found";
import Home from "../page";
import AppError from "./error";
import AppLayout from "./layout";
import HabitsPage from "./habits/page";
import SettingsPage from "./settings/page";
import StatsPage from "./stats/page";
import TodayPage from "./today/page";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const catalogs = {
  en: { common: commonEn, nav: navEn, today: todayEn, settings: settingsEn, auth: authEn },
  es: { common: commonEs, nav: navEs, today: todayEs, settings: settingsEs, auth: authEn },
};

const request = vi.hoisted(() => ({
  locale: "en" as "en" | "es",
  timeZone: "America/Lima",
  userAgent: "",
  cookies: new Map<string, string>(),
  user: { id: "user-1", email: "ana@example.com" } as { id: string; email?: string } | null,
  profile: { display_name: null as string | null },
}));

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  profileQuery: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getUser: async () => request.user,
  requireUser: mocks.requireUser,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined,
  }),
  headers: async () => new Headers({ "user-agent": request.userAgent }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: mocks.redirect,
  usePathname: () => "/today",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next-intl/server", async () => {
  const intl = await import("next-intl");
  return {
    getTranslations: async (namespace?: string) =>
      intl.createTranslator({
        locale: request.locale,
        messages: catalogs[request.locale],
        // The namespace is checked by TypeScript at the call sites.
        namespace: namespace as never,
      }),
    getFormatter: async () =>
      intl.createFormatter({ locale: request.locale, timeZone: request.timeZone }),
    getTimeZone: async () => request.timeZone,
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profileQuery }) }) }),
  }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/i18n/actions", () => ({ setUserLocale: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
// Other areas' components: only their placement matters here.
vi.mock("@/components/pwa/install-guide", () => ({
  InstallGuide: () => <div data-testid="install-guide" />,
}));
vi.mock("@/components/push/push-settings", () => ({
  PushSettings: () => <div data-testid="push-settings" />,
}));
vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: ({ everywhere = false }: { everywhere?: boolean }) => (
    <button type="button">{everywhere ? "Sign out of all devices" : "Sign out"}</button>
  ),
}));

beforeEach(() => {
  request.locale = "en";
  request.timeZone = "America/Lima";
  request.userAgent = DESKTOP_UA;
  request.cookies.clear();
  request.user = { id: "user-1", email: "ana@example.com" };
  mocks.requireUser.mockImplementation(async () => request.user);
  mocks.profileQuery.mockResolvedValue({ data: { display_name: null }, error: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function show(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider
      locale={request.locale}
      messages={catalogs[request.locale]}
      timeZone={request.timeZone}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("/", () => {
  it("opens Today when signed in, sign-in otherwise", async () => {
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT /today");
    request.user = null;
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("(app) layout", () => {
  it("checks the session, then renders the shell around the page", async () => {
    const layout = await AppLayout({ children: <p>Page content</p> });
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(isValidElement(layout) && layout.type).toBe(AppShell);

    show(await AppShell({ children: <p>Page content</p> }));
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(within(main).getByText("Page content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: navEn.skipToContent })).toHaveAttribute(
      "href",
      "#main",
    );
    // Both navigations exist; CSS shows one per screen size.
    expect(document.querySelector('[data-shell="tab-bar"]')).toHaveAttribute("aria-label", "Main");
    expect(document.querySelector('[data-shell="sidebar"] nav')).toHaveAttribute(
      "aria-label",
      "Main",
    );
    expect(screen.getByRole("link", { name: commonEn.appName })).toHaveAttribute("href", "/today");
  });

  it("does not render the shell without a session", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login?next=%2Ftoday"));
    await expect(AppLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("/today", () => {
  it("shows the habit day, the setup checklist and the empty state", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T15:00:00Z")); // 10:00 in Lima

    show(await TodayPage());

    expect(mocks.requireUser).toHaveBeenCalledWith("/today");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Tuesday, October 20");
    expect(heading.querySelector("time")).toHaveAttribute("dateTime", "2026-10-20");
    expect(screen.getByRole("region", { name: todayEn.setup.title })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: todayEn.empty.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: todayEn.empty.action })).toHaveAttribute(
      "href",
      "/habits",
    );
  });

  it("is still the previous day before 04:00 (R-DAY-2)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T08:30:00Z")); // 03:30 in Lima

    show(await TodayPage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Monday, October 19");
  });

  it("prints the date in Spanish", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
    request.locale = "es";

    show(await TodayPage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("martes, 20 de octubre");
    expect(screen.getByText(todayEs.empty.title)).toBeInTheDocument();
  });

  it("adds the iPhone-only steps for iPhone user agents", async () => {
    request.userAgent = IPHONE_UA;
    show(await TodayPage());
    expect(screen.getByText(todayEn.setup.items.siri.title)).toBeInTheDocument();
    expect(screen.getByText(todayEn.setup.items.health.title)).toBeInTheDocument();
  });

  it("leaves the checklist out once hidden on this device", async () => {
    request.cookies.set("RESTART_SETUP_HIDDEN", "1");
    show(await TodayPage());
    expect(screen.queryByRole("region", { name: todayEn.setup.title })).not.toBeInTheDocument();
    expect(screen.getByText(todayEn.empty.title)).toBeInTheDocument();
  });
});

describe("/habits and /stats", () => {
  it("say what's coming next", async () => {
    show(await HabitsPage());
    expect(mocks.requireUser).toHaveBeenCalledWith("/habits");
    expect(screen.getByRole("heading", { level: 1, name: navEn.habits })).toBeInTheDocument();
    expect(screen.getByText(navEn.placeholder.habits.title)).toBeInTheDocument();
    cleanup();

    show(await StatsPage());
    expect(mocks.requireUser).toHaveBeenCalledWith("/stats");
    expect(screen.getByRole("heading", { level: 1, name: navEn.stats })).toBeInTheDocument();
    expect(screen.getByText(navEn.placeholder.stats.title)).toBeInTheDocument();
  });
});

describe("/settings", () => {
  it("has the linkable sections, in order, with their controls", async () => {
    mocks.profileQuery.mockResolvedValue({ data: { display_name: " Ana " }, error: null });

    show(await SettingsPage());

    expect(mocks.requireUser).toHaveBeenCalledWith("/settings");
    expect(screen.getByRole("heading", { level: 1, name: settingsEn.title })).toBeInTheDocument();
    const ids = [...document.querySelectorAll("section[id]")].map((section) => section.id);
    expect(ids).toEqual(["profile", "language", "theme", "install", "notifications", "account"]);

    const profile = screen.getByRole("region", { name: settingsEn.profile.title });
    expect(within(profile).getByText("ana@example.com")).toBeInTheDocument();
    expect(within(profile).getByText("Ana")).toBeInTheDocument();

    expect(screen.getByRole("group", { name: settingsEn.language.title })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: settingsEn.theme.title })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: settingsEn.install.title })).getByTestId(
        "install-guide",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: settingsEn.notifications.title })).getByTestId(
        "push-settings",
      ),
    ).toBeInTheDocument();
    const account = screen.getByRole("region", { name: settingsEn.account.title });
    expect(within(account).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(
      within(account).getByRole("button", { name: "Sign out of all devices" }),
    ).toBeInTheDocument();
  });

  it("still renders when the profile can't be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.profileQuery.mockResolvedValue({ data: null, error: { code: "PGRST301" } });

    show(await SettingsPage());

    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByText(settingsEn.profile.name)).not.toBeInTheDocument();
  });
});

describe("not found and errors", () => {
  it("not found links back to Today", async () => {
    show(await NotFound());
    expect(screen.getByRole("heading", { level: 1, name: navEn.notFound.title })).toBeVisible();
    expect(screen.getByRole("link", { name: navEn.notFound.action })).toHaveAttribute(
      "href",
      "/today",
    );
  });

  it.each([
    ["root", RootError],
    ["(app)", AppError],
  ] as const)("the %s error screen retries and shows the error code", (_, ErrorComponent) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    show(<ErrorComponent error={error} retry={retry} />);

    expect(screen.getByRole("heading", { level: 1, name: navEn.error.title })).toBeVisible();
    expect(screen.getByText("Error code: abc123")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: navEn.error.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: navEn.error.action })).toHaveAttribute(
      "href",
      "/today",
    );
  });
});
