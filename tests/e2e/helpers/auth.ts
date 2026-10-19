import { expect, type Page } from "@playwright/test";

/**
 * Sign-in helpers for end-to-end tests. They drive the real /login form and read the code
 * from Mailpit, the local Supabase stack's mail catcher (`npm run db:start`).
 *
 * Selectors use element ids and attributes, not button text, so the tests work in both
 * languages.
 */

const MAILPIT_URL = (process.env.MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");

/** The email template shows the code as a standalone 6-digit number. */
const CODE_PATTERN = /\b(\d{6})\b/;

const EMAIL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;

type MailpitSearch = { messages?: { ID: string }[] };
type MailpitMessage = { Subject?: string; Text?: string; HTML?: string };

/** A new address for each call, so parallel tests never share an account or an inbox. */
export function uniqueEmail(prefix = "e2e"): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}+${Date.now().toString(36)}${random}@restart.test`;
}

async function mailpit<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

async function messageIdsFor(email: string): Promise<string[]> {
  const query = new URLSearchParams({ query: `to:"${email}"` });
  const result = await mailpit<MailpitSearch>(`/api/v1/search?${query.toString()}`);
  return (result.messages ?? []).map((message) => message.ID);
}

function textFromHtml(html: string | undefined): string | undefined {
  return html
    ?.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
}

/** The code from an email: plain text first, then the HTML's text, then the subject. */
export function extractCode(message: MailpitMessage): string | null {
  for (const source of [message.Text, textFromHtml(message.HTML), message.Subject]) {
    const match = source ? CODE_PATTERN.exec(source) : null;
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Waits for a sign-in email to `email` that isn't in `alreadySeen` and returns its code.
 * Polls Mailpit for up to 15 seconds.
 */
export async function waitForEmailCode(
  email: string,
  alreadySeen: ReadonlySet<string> = new Set(),
): Promise<string> {
  const deadline = Date.now() + EMAIL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const fresh = (await messageIdsFor(email)).find((id) => !alreadySeen.has(id));
    if (fresh) {
      const message = await mailpit<MailpitMessage>(`/api/v1/message/${encodeURIComponent(fresh)}`);
      const code = extractCode(message);
      if (!code) throw new Error(`The sign-in email to ${email} has no 6-digit code`);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`No sign-in email reached ${email} within ${EMAIL_TIMEOUT_MS / 1000} s`);
}

/**
 * Opens /login, asks for a code for `email` and waits for the code step. Returns the ids
 * of emails that were already there, for `waitForEmailCode`.
 */
export async function requestEmailCode(page: Page, email: string): Promise<Set<string>> {
  const alreadySeen = new Set(await messageIdsFor(email));
  await page.goto("/login");
  const emailField = page.locator("#login-email");
  const submit = page.locator('form:has(#login-email) button[type="submit"]');
  // The button is enabled once the page has hydrated; typing earlier could be lost.
  await expect(submit).toBeEnabled();
  await emailField.fill(email);
  await submit.click();
  await expect(page.locator("#login-code")).toBeVisible();
  return alreadySeen;
}

/** Types a code into the code step. 6 digits submit on their own. */
export async function enterCode(page: Page, code: string): Promise<void> {
  await page.locator("#login-code").fill(code);
}

export const isTodayUrl = (url: URL) => url.pathname === "/today";

/**
 * Signs in through the email-code form and waits for /today. Creates the account on first
 * use. Returns the email used (a unique one when none is given).
 */
export async function signInWithEmailCode(page: Page, email?: string): Promise<string> {
  const address = email ?? uniqueEmail();
  const alreadySeen = await requestEmailCode(page, address);
  const code = await waitForEmailCode(address, alreadySeen);
  await enterCode(page, code);
  await page.waitForURL(isTodayUrl, { timeout: 15_000 });
  return address;
}
