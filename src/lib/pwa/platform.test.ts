// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectPlatform,
  iosSupportsWebPush,
  isStandalone,
  parseIosVersion,
  subscribeToDisplayMode,
} from "./platform";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  iphoneIos26:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneOld:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
};

describe("detectPlatform", () => {
  it.each([
    ["iPhone Safari", UA.iphone, 5, "ios"],
    ["iPhone Chrome", UA.iphoneChrome, 5, "ios"],
    ["iPad asking for the desktop site", UA.ipadDesktopMode, 5, "ios"],
    ["Android", UA.android, 5, "android"],
    ["macOS without touch", UA.ipadDesktopMode, 0, "desktop"],
    ["macOS Chrome", UA.macChrome, 0, "desktop"],
    ["Windows", UA.windows, 0, "desktop"],
    ["Windows with a touch screen", UA.windows, 10, "desktop"],
    ["Linux", UA.linuxFirefox, 0, "desktop"],
    ["an empty user agent", "", 0, "desktop"],
  ] as const)("%s → %s", (_name, ua, touch, expected) => {
    expect(detectPlatform(ua, touch)).toBe(expected);
  });

  it("defaults to no touch points", () => {
    expect(detectPlatform(UA.ipadDesktopMode)).toBe("desktop");
  });
});

describe("parseIosVersion", () => {
  it("reads the OS version on iPhone", () => {
    expect(parseIosVersion(UA.iphone)).toEqual({ major: 17, minor: 4 });
    expect(parseIosVersion(UA.iphoneChrome)).toEqual({ major: 17, minor: 4 });
  });

  it("prefers Safari's version when the OS version is frozen (iOS 26)", () => {
    expect(parseIosVersion(UA.iphoneIos26)).toEqual({ major: 26, minor: 0 });
  });

  it("reads Safari's version for iPad in desktop mode", () => {
    expect(parseIosVersion(UA.ipadDesktopMode)).toEqual({ major: 17, minor: 2 });
  });

  it("returns null when there is no version", () => {
    expect(parseIosVersion(UA.windows)).toBeNull();
    expect(parseIosVersion("")).toBeNull();
  });
});

describe("iosSupportsWebPush", () => {
  it.each([
    [{ major: 16, minor: 3 }, false],
    [{ major: 16, minor: 4 }, true],
    [{ major: 17, minor: 0 }, true],
    [{ major: 15, minor: 9 }, false],
    [null, true],
  ] as const)("%j → %s", (version, expected) => {
    expect(iosSupportsWebPush(version)).toBe(expected);
  });

  it("works with parsed user agents", () => {
    expect(iosSupportsWebPush(parseIosVersion(UA.iphoneOld))).toBe(false);
    expect(iosSupportsWebPush(parseIosVersion(UA.iphoneIos26))).toBe(true);
  });
});

describe("isStandalone", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
  });

  function stubDisplayMode(standalone: boolean) {
    const listeners = new Set<() => void>();
    const query = {
      matches: standalone,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => query),
    );
    return { query, listeners };
  }

  it("is true in display-mode standalone", () => {
    stubDisplayMode(true);
    expect(isStandalone()).toBe(true);
  });

  it("is true on iOS Home Screen apps (navigator.standalone)", () => {
    stubDisplayMode(false);
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
  });

  it("is false in a browser tab", () => {
    stubDisplayMode(false);
    expect(isStandalone()).toBe(false);
  });

  it("subscribes to display-mode changes and cleans up", () => {
    const { listeners } = stubDisplayMode(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeToDisplayMode(onChange);
    expect(listeners.size).toBe(1);
    for (const l of listeners) l();
    expect(onChange).toHaveBeenCalledOnce();
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
