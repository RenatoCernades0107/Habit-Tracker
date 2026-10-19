// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import commonEn from "@messages/en/common.json";
import todayEn from "@messages/en/today.json";
import type { Platform } from "@/lib/pwa/platform";

import { SetupChecklist } from "./setup-checklist";
import { SETUP_HIDDEN_COOKIE } from "./setup-items";

type ToastOptions = { action?: { label: string; onClick: () => void } };

const mocks = vi.hoisted(() => ({
  toast: vi.fn<(message: string, options?: ToastOptions) => void>(),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const setup = todayEn.setup;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
  document.cookie = `${SETUP_HIDDEN_COOKIE}=; path=/; max-age=0`;
});

/** Pretends this browser runs as an installed app with a push subscription. */
function stubSetUpDevice() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => ({ endpoint: "https://push.example/1" }) },
      }),
    },
  });
}

async function renderChecklist(platform: Platform) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ today: todayEn, common: commonEn }}>
      <main id="main" tabIndex={-1}>
        <SetupChecklist platform={platform} />
      </main>
    </NextIntlClientProvider>,
  );
  // Detection finishes: the list stops being busy.
  await waitFor(() => expect(screen.getByRole("list")).not.toHaveAttribute("aria-busy"));
  return view;
}

describe("SetupChecklist", () => {
  it("lists install, notifications and calendar on a computer", async () => {
    await renderChecklist("desktop");

    const region = screen.getByRole("region", { name: setup.title });
    expect(within(region).getAllByRole("listitem")).toHaveLength(3);

    const install = screen.getByRole("link", { name: `${setup.items.install.title} Not done yet` });
    expect(install).toHaveAttribute("href", "/settings#install");
    expect(install).toHaveAccessibleDescription(setup.items.install.descriptionDesktop);
    expect(
      screen.getByRole("link", { name: `${setup.items.notifications.title} Not done yet` }),
    ).toHaveAttribute("href", "/settings#notifications");

    const calendar = screen.getByText(setup.items.calendar.title).closest("li");
    expect(calendar).not.toBeNull();
    expect(within(calendar!).getByText(commonEn.comingSoon)).toBeInTheDocument();
    expect(within(calendar!).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(setup.items.siri.title)).not.toBeInTheDocument();
  });

  it("adds Siri and Apple Health on iPhone", async () => {
    await renderChecklist("ios");

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText(setup.items.siri.title)).toBeInTheDocument();
    expect(screen.getByText(setup.items.health.title)).toBeInTheDocument();
    expect(screen.getAllByText(commonEn.comingSoon)).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: `${setup.items.install.title} Not done yet` }),
    ).toHaveAccessibleDescription(setup.items.install.description);
  });

  it("checks off what this device has done", async () => {
    stubSetUpDevice();
    await renderChecklist("android");

    await waitFor(() => expect(screen.queryAllByRole("link")).toHaveLength(0));
    for (const title of [setup.items.install.title, setup.items.notifications.title]) {
      const row = screen.getByText(title).closest("li");
      expect(within(row!).getByText(setup.status.done)).toBeInTheDocument();
    }
  });

  it("is not done without notification permission, even with a subscription", async () => {
    stubSetUpDevice();
    vi.stubGlobal("Notification", { permission: "default" });
    await renderChecklist("android");

    expect(
      screen.getByRole("link", { name: `${setup.items.notifications.title} Not done yet` }),
    ).toBeInTheDocument();
  });

  it("hides, remembers it in a cookie, and can be undone", async () => {
    await renderChecklist("desktop");

    fireEvent.click(screen.getByRole("button", { name: setup.hide }));

    expect(screen.queryByRole("region", { name: setup.title })).not.toBeInTheDocument();
    expect(document.cookie).toContain(`${SETUP_HIDDEN_COOKIE}=1`);
    expect(document.activeElement).toBe(document.getElementById("main"));
    expect(mocks.toast).toHaveBeenCalledWith(setup.hidden, expect.anything());

    const undo = mocks.toast.mock.calls[0]?.[1]?.action;
    expect(undo?.label).toBe(setup.undo);
    act(() => undo?.onClick());

    expect(screen.getByRole("region", { name: setup.title })).toBeInTheDocument();
    expect(document.cookie).not.toContain(`${SETUP_HIDDEN_COOKIE}=1`);
  });
});
