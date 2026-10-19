import { describe, expect, it } from "vitest";

import { deviceLabel } from "./device-label";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  // The installed Home Screen app drops "Safari/…" from the user agent.
  iphoneStandalone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  linuxChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  macOpera:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
};

describe("deviceLabel", () => {
  it.each([
    [UA.iphoneSafari, 5, "iPhone · Safari"],
    [UA.iphoneStandalone, 5, "iPhone · Safari"],
    [UA.iphoneChrome, 5, "iPhone · Chrome"],
    [UA.ipadDesktop, 5, "iPad · Safari"],
    [UA.ipadDesktop, 0, "Mac · Safari"],
    [UA.androidChrome, 5, "Android · Chrome"],
    [UA.androidSamsung, 5, "Android · Samsung Internet"],
    [UA.windowsEdge, 0, "Windows · Edge"],
    [UA.windowsFirefox, 0, "Windows · Firefox"],
    [UA.linuxChrome, 0, "Linux · Chrome"],
    [UA.macOpera, 0, "Mac · Opera"],
  ])("%s → %s", (ua, touchPoints, expected) => {
    expect(deviceLabel(ua, touchPoints)).toBe(expected);
  });

  it("returns an empty label for an unknown agent", () => {
    expect(deviceLabel("curl/8.0")).toBe("");
  });
});
