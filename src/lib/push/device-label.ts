/**
 * A short name for this device in the list of subscriptions, e.g. "iPhone · Safari".
 * Product names only, so it needs no translation. Order matters: Edge, Opera and Samsung
 * Internet also say "Chrome", and every browser says "Safari".
 */
export function deviceLabel(userAgent: string, maxTouchPoints = 0): string {
  return [deviceName(userAgent, maxTouchPoints), browserName(userAgent)]
    .filter(Boolean)
    .join(" · ");
}

function deviceName(ua: string, maxTouchPoints: number): string | null {
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  // iPadOS asks for the desktop site and reports a Mac; only the touch screen tells.
  if (/Macintosh/i.test(ua)) return maxTouchPoints > 1 ? "iPad" : "Mac";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

function browserName(ua: string): string | null {
  if (/EdgiOS|EdgA?\//i.test(ua)) return "Edge";
  if (/OPR\/|OPiOS|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/FxiOS|Firefox\//i.test(ua)) return "Firefox";
  if (/CriOS|Chrome\/|Chromium\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) || /iPhone|iPad|iPod|Macintosh/i.test(ua)) return "Safari";
  return null;
}
