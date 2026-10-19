// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import pwaEn from "@messages/en/pwa.json";

import { ServiceWorkerRegister } from "./sw-register";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), push: vi.fn() }));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

type ToastOptions = { action: { label: string; onClick: () => void } };

function fakeContainer(registration: object) {
  const container = Object.assign(new EventTarget(), {
    controller: {},
    register: vi.fn(async () => registration),
    ready: Promise.resolve({ active: { postMessage: vi.fn() } }),
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: container,
  });
  return container;
}

function fakeRegistration(waiting: object | null) {
  return Object.assign(new EventTarget(), { waiting, installing: null, update: vi.fn() });
}

function renderRegister() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ pwa: pwaEn }}>
      <ServiceWorkerRegister />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window.navigator, "clearAppBadge", {
    configurable: true,
    value: vi.fn(async () => {}),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  Reflect.deleteProperty(window.navigator, "clearAppBadge");
});

describe("ServiceWorkerRegister", () => {
  it("doesn't register outside production builds, but still clears the badge", () => {
    const container = fakeContainer(fakeRegistration(null));
    renderRegister();
    expect(container.register).not.toHaveBeenCalled();
    expect(window.navigator.clearAppBadge).toHaveBeenCalled();
  });

  it("registers /sw.js and offers a waiting update", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SW_IN_DEV", "1");
    const waiting = Object.assign(new EventTarget(), {
      state: "installed",
      postMessage: vi.fn(),
    });
    const container = fakeContainer(fakeRegistration(waiting));
    renderRegister();

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    const [message, options] = mocks.toast.mock.calls[0] as [string, ToastOptions];
    expect(message).toBe("Update available");
    expect(options.action.label).toBe("Update");

    // Fake timers: the reload fallback must not fire after the test.
    vi.useFakeTimers();
    options.action.onClick();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("opens the page a notification asks for", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SW_IN_DEV", "1");
    const container = fakeContainer(fakeRegistration(null));
    renderRegister();
    await waitFor(() => expect(container.register).toHaveBeenCalled());

    container.dispatchEvent(
      new MessageEvent("message", { data: { type: "NAVIGATE", url: "/today?habit=1" } }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/today?habit=1");
  });
});
