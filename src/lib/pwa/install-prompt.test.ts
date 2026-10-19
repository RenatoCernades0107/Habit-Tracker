import { describe, expect, it, vi } from "vitest";

import { createInstallPromptStore, type BeforeInstallPromptEvent } from "./install-prompt";

function fakePromptEvent(outcome: "accepted" | "dismissed", promptError?: Error) {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(() => (promptError ? Promise.reject(promptError) : Promise.resolve()));
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  return { event, prompt };
}

describe("install prompt store", () => {
  it("starts idle and has nothing to prompt", async () => {
    const store = createInstallPromptStore(new EventTarget());
    expect(store.getSnapshot()).toBe("idle");
    expect(store.getServerSnapshot()).toBe("idle");
    await expect(store.promptInstall()).resolves.toBe("unavailable");
  });

  it("captures beforeinstallprompt, suppresses the mini-infobar and notifies subscribers", () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    const listener = vi.fn();
    store.subscribe(listener);

    const { event } = fakePromptEvent("accepted");
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.getSnapshot()).toBe("available");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("marks the app installed when the user accepts, and uses the prompt only once", async () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    const { event, prompt } = fakePromptEvent("accepted");
    target.dispatchEvent(event);

    await expect(store.promptInstall()).resolves.toBe("accepted");
    expect(prompt).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toBe("installed");
    await expect(store.promptInstall()).resolves.toBe("unavailable");
  });

  it("goes back to idle when the user dismisses the dialog", async () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(fakePromptEvent("dismissed").event);

    await expect(store.promptInstall()).resolves.toBe("dismissed");
    expect(store.getSnapshot()).toBe("idle");
  });

  it("survives a prompt() that throws", async () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(fakePromptEvent("accepted", new Error("already used")).event);

    await expect(store.promptInstall()).resolves.toBe("unavailable");
    expect(store.getSnapshot()).toBe("idle");
  });

  it("treats appinstalled as installed, even if a prompt arrives later", () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(new Event("appinstalled"));
    expect(store.getSnapshot()).toBe("installed");

    target.dispatchEvent(fakePromptEvent("accepted").event);
    expect(store.getSnapshot()).toBe("installed");
  });

  it("stops notifying after unsubscribe and after dispose", () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(target);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    target.dispatchEvent(fakePromptEvent("accepted").event);
    expect(listener).not.toHaveBeenCalled();

    store.dispose();
    target.dispatchEvent(new Event("appinstalled"));
    expect(store.getSnapshot()).toBe("available");
  });
});
