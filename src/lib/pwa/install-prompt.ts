/**
 * Captures the browser's install prompt (`beforeinstallprompt`, Chromium on Android and
 * desktop) so the install guide can offer an "Install app" button (FR-PWA-1). The event
 * fires once, early, and is lost if nobody listens, so this module starts listening as soon
 * as it's imported in the browser (ServiceWorkerRegister imports it from the root layout).
 * Exposed as a store for React's useSyncExternalStore.
 */

/** Not in TypeScript's DOM types yet (non-standard, Chromium only). */
export type BeforeInstallPromptEvent = Event & {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
  prompt(): Promise<unknown>;
};

/**
 * idle: no prompt captured (Safari, Firefox, already installed, or not yet eligible).
 * available: the browser lets us show its install dialog.
 * installed: the app was installed during this visit.
 */
export type InstallPromptStatus = "idle" | "available" | "installed";

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export type InstallPromptStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): InstallPromptStatus;
  getServerSnapshot(): InstallPromptStatus;
  /** Shows the browser's install dialog. A captured prompt can only be used once. */
  promptInstall(): Promise<InstallOutcome>;
  /** Stops listening (tests). */
  dispose(): void;
};

export function createInstallPromptStore(target: EventTarget): InstallPromptStore {
  let deferred: BeforeInstallPromptEvent | null = null;
  let status: InstallPromptStatus = "idle";
  const listeners = new Set<() => void>();

  const setStatus = (next: InstallPromptStatus) => {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  };

  const onBeforeInstallPrompt = (event: Event) => {
    // Keep the mini-infobar from showing; the app offers its own button at a better moment.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    if (status !== "installed") setStatus("available");
  };

  const onAppInstalled = () => {
    deferred = null;
    setStatus("installed");
  };

  target.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  target.addEventListener("appinstalled", onAppInstalled);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => status,
    getServerSnapshot: () => "idle",
    async promptInstall() {
      const event = deferred;
      if (!event) return "unavailable";
      deferred = null;
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        setStatus(outcome === "accepted" ? "installed" : "idle");
        return outcome;
      } catch {
        // prompt() throws if the event was already used or the page lost user activation.
        setStatus("idle");
        return "unavailable";
      }
    },
    dispose() {
      target.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      target.removeEventListener("appinstalled", onAppInstalled);
      listeners.clear();
    },
  };
}

const noopStore: InstallPromptStore = {
  subscribe: () => () => {},
  getSnapshot: () => "idle",
  getServerSnapshot: () => "idle",
  promptInstall: async () => "unavailable",
  dispose: () => {},
};

/** The app-wide store, listening from the moment this module loads in the browser. */
export const installPrompt: InstallPromptStore =
  typeof window === "undefined" ? noopStore : createInstallPromptStore(window);
