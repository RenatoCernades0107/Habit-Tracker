/**
 * Push services the server may POST to. A subscription's endpoint is chosen by the
 * browser, but the request that registers it comes from a client we don't trust: without
 * this list, anyone signed in could make the tick send requests to any URL (SSRF).
 *
 * - Chrome, Edge on Android, Samsung Internet, Opera, Brave: Firebase Cloud Messaging.
 * - Firefox: Mozilla autopush.
 * - Safari on macOS, iPhone and iPad: Apple Push Notification service (*.push.apple.com).
 * - Edge on Windows: Windows Push Notification Services (*.notify.windows.com).
 */
const EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

/** Any subdomain of these (at least one more label), never the bare domain itself. */
const HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export const MAX_ENDPOINT_LENGTH = 2048;

/** Printable ASCII without spaces: real endpoints are plain URLs, never Unicode lookalikes. */
const PLAIN_URL = /^[\x21-\x7e]+$/;

/**
 * True if `endpoint` is an https URL on a known push service: no credentials, no custom
 * port, no IP address, and a host that is on the list exactly or as a subdomain.
 */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string") return false;
  if (endpoint.length > MAX_ENDPOINT_LENGTH || !PLAIN_URL.test(endpoint)) return false;
  // The URL parser accepts "https:host" and backslashes; require the canonical form.
  if (!endpoint.startsWith("https://")) return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  // Only URLs already in canonical form (no backslashes, percent-encoded hosts, dot
  // segments…). web-push parses the endpoint again with Node's legacy url.parse, and any
  // difference between the two parsers could send the request to another host.
  if (url.href !== endpoint) return false;
  // "https://fcm.googleapis.com@evil.example" has host evil.example; reject any userinfo.
  if (url.username !== "" || url.password !== "") return false;
  // An empty port means 443 (the URL parser drops the default port).
  if (url.port !== "") return false;

  const host = url.hostname;
  if (host === "" || host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  if (EXACT_HOSTS.has(host)) return true;
  return HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length && !host.startsWith("."),
  );
}
