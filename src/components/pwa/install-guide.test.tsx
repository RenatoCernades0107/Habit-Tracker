// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import pwaEn from "@messages/en/pwa.json";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  oldIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

function setDevice(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: userAgent });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints,
  });
}

function stubStandalone(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

/** A fresh module graph per test, so the install-prompt store starts empty. */
async function loadGuide() {
  vi.resetModules();
  return (await import("./install-guide")).InstallGuide;
}

function withIntl(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={{ pwa: pwaEn }}>
      {ui}
    </NextIntlClientProvider>
  );
}

function offerInstallPrompt(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  act(() => {
    window.dispatchEvent(event);
  });
  return prompt;
}

beforeEach(() => setDevice(UA.windows));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InstallGuide", () => {
  it("renders nothing on the server, so hydration can't mismatch", async () => {
    const InstallGuide = await loadGuide();
    expect(renderToString(withIntl(<InstallGuide />))).toBe("");
  });

  it("shows the Share → Add to Home Screen steps on iPhone", async () => {
    setDevice(UA.iphone, 5);
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide />));

    const steps = screen.getByRole("list", { name: "How to install Restart" });
    expect(steps.tagName).toBe("OL");
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Share");
    expect(items[1]).toHaveTextContent("Add to Home Screen");
    expect(items[2]).toHaveTextContent("Add");
    expect(screen.getByText(/iOS 16\.4 or later/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("treats an iPad asking for the desktop site as iOS", async () => {
    setDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
      5,
    );
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide />));
    expect(screen.getByRole("list", { name: "How to install Restart" }).tagName).toBe("OL");
  });

  it("warns that old iOS versions can't get notifications", async () => {
    setDevice(UA.oldIphone, 5);
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide />));
    expect(screen.getByText(/Update to iOS 16\.4 or later/)).toBeInTheDocument();
  });

  it("offers the browser's install dialog when Chromium provides one", async () => {
    setDevice(UA.android, 5);
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide />));
    const prompt = offerInstallPrompt("accepted");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    });

    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Done! Restart is now on this device.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("falls back to the menu steps when the dialog was dismissed", async () => {
    setDevice(UA.android, 5);
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide />));
    offerInstallPrompt("dismissed");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    });

    const steps = screen.getByRole("list", { name: "How to install Restart" });
    expect(within(steps).getAllByRole("listitem")[1]).toHaveTextContent("Install app");
  });

  it("explains the install options per browser on desktop", async () => {
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide />));
    const options = screen.getByRole("list", { name: "How to install Restart" });
    expect(options.tagName).toBe("UL");
    expect(options).toHaveTextContent("Chrome or Edge");
    expect(options).toHaveTextContent("Add to Dock");
  });

  it("confirms when the app already runs installed", async () => {
    stubStandalone(true);
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide />));
    expect(screen.getByText("Restart is installed on this device.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("compact: one line and a button that expands the steps", async () => {
    setDevice(UA.iphone, 5);
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide compact />));

    expect(screen.getByText(pwaEn.install.compact)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show me how" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide steps" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const steps = screen.getByRole("list", { name: "How to install Restart" });
    expect(toggle.getAttribute("aria-controls")).toBe(steps.parentElement?.parentElement?.id);
  });

  it("compact: installs directly when the browser offers its dialog", async () => {
    setDevice(UA.windows);
    const InstallGuide = await loadGuide();
    render(withIntl(<InstallGuide compact />));
    offerInstallPrompt("accepted");
    expect(screen.getByRole("button", { name: "Install app" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me how" })).not.toBeInTheDocument();
  });
});
