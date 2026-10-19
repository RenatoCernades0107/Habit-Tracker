#!/usr/bin/env node
// Spike S6 (docs/spikes/S6-google-calendar.md, docs/spec/08-roadmap.md): can the
// `calendar.app.created` scope do everything Restart needs (docs/spec/06-integrations.md §3),
// and do refresh tokens of an unverified app "In production" last more than 7 days?
//
// Dependency-free Node 22: global fetch, node:http (loopback redirect), node:crypto (PKCE).
// Tokens are never printed. The refresh token is saved outside the repository with mode 0600.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const SCOPES = [CALENDAR_SCOPE, "openid", "email"];
const CALLBACK_PATH = "/oauth2callback";
const CONSENT_TIMEOUT_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;
const EIGHT_DAYS_MS = 8 * DAY_MS;

// The event under test, as in docs/spec/06-integrations.md §3.5.
const CALENDAR_SUMMARY = "Restart spike";
const EVENT_SUMMARY = "🧘 Meditar (Restart spike)";
const RRULE = "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,TH,FR";
const BYDAY = new Set([1, 2, 4, 5]); // getUTCDay(): Monday, Tuesday, Thursday, Friday
const START_HOUR = 7;
const DURATION_MIN = 15;
const GREEN_COLOR_ID = "10"; // "Basil" in Google Calendar's event palette

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_TOKEN_FILE = join(homedir(), ".restart-s6-token.json");

const HELP = `Spike S6 · Google Calendar with the calendar.app.created scope

Usage:
  node scripts/spikes/s6-google-calendar.mjs [--tz <IANA zone>]   full test (signs in)
  node scripts/spikes/s6-google-calendar.mjs --refresh-check       8-day refresh token test
  node scripts/spikes/s6-google-calendar.mjs --cleanup [--revoke]  delete the test calendars

Options:
  --tz <zone>          Time zone of the test calendar (default America/Lima)
  --token-file <path>  Where the refresh token is kept, outside the repository
                       (default ~/.restart-s6-token.json, mode 0600)
  --refresh-check      Get a new access token with the saved refresh token and show its age
  --cleanup            Delete every calendar this script created (saved in the token file)
  --revoke             Revoke the saved refresh token at Google and delete the token file
  -h, --help           Show this help

Environment (an OAuth client of type "Desktop app", see docs/spikes/S6-google-calendar.md):
  GOOGLE_CLIENT_ID      ….apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET  the client's secret

The full test runs these steps and prints PASS or FAIL for each:
  1. Sign in and consent (loopback redirect on 127.0.0.1, PKCE S256, state check)
  2. Create a secondary calendar "${CALENDAR_SUMMARY}" in --tz
  3. Insert a recurring event: weekly MO,TU,TH,FR at 07:00 for 15 minutes, no reminders,
     shown as free, with extendedProperties.private.habitId
  4. Find the event by its habitId (as a full resync would)
  5. List next week's instances (events.instances)
  6. Patch one instance: "✅ " in front of the name and a green color
  7. Add an EXDATE for another instance by patching the series' recurrence
  8. Check the result: the excluded day is gone and the patched instance kept its ✅

Running the full test again issues a new refresh token and restarts the 8-day clock.
Tokens are never printed.`;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const results = [];

function report(status, label, detail) {
  results.push({ status, label });
  const line = `  ${status.padEnd(4)}  ${label}`;
  console.log(detail ? `${line}\n        ${detail}` : line);
}

class SpikeError extends Error {}

function fail(message) {
  throw new SpikeError(message);
}

function errorMessage(error) {
  if (error instanceof SpikeError || error instanceof GoogleApiError) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "The request timed out.";
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Options and environment
// ---------------------------------------------------------------------------

function readOptions() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        tz: { type: "string", default: "America/Lima" },
        "token-file": { type: "string", default: DEFAULT_TOKEN_FILE },
        "refresh-check": { type: "boolean", default: false },
        cleanup: { type: "boolean", default: false },
        revoke: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    console.error(`${errorMessage(error)}\n\n${HELP}`);
    process.exit(2);
  }
  const { values } = parsed;
  if (values["refresh-check"] && (values.cleanup || values.revoke)) {
    console.error("Use --refresh-check on its own.");
    process.exit(2);
  }
  if (!isValidTimeZone(values.tz)) {
    console.error(`Unknown time zone "${values.tz}". Use an IANA name such as America/Lima.`);
    process.exit(2);
  }
  return {
    tz: values.tz,
    tokenFile: resolveTokenFile(values["token-file"]),
    refreshCheck: values["refresh-check"],
    cleanup: values.cleanup,
    revoke: values.revoke,
    help: values.help,
  };
}

function resolveTokenFile(path) {
  const expanded = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  const file = resolve(expanded);
  const fromRepo = relative(REPO_ROOT, file);
  // A token inside the working tree could be committed by mistake.
  if (fromRepo === "" || (!fromRepo.startsWith("..") && !isAbsolute(fromRepo))) {
    console.error(`Keep the token file outside the repository (got ${file}).`);
    process.exit(2);
  }
  return file;
}

function readClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    console.error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (an OAuth client of type Desktop app).\n" +
        "See docs/spikes/S6-google-calendar.md, or run with --help.",
    );
    process.exit(2);
  }
  return { clientId, clientSecret };
}

// ---------------------------------------------------------------------------
// Token file (outside the repository, mode 0600)
// ---------------------------------------------------------------------------

function loadTokenFile(file) {
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (typeof data?.refresh_token !== "string" || typeof data?.obtained_at !== "string") {
      fail(`${file} isn't a token file from this script.`);
    }
    return { ...data, calendars: Array.isArray(data.calendars) ? data.calendars : [] };
  } catch (error) {
    if (error instanceof SpikeError) throw error;
    fail(`Couldn't read ${file}: ${errorMessage(error)}`);
  }
}

function saveTokenFile(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  // writeFileSync only applies the mode when it creates the file.
  chmodSync(file, 0o600);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

class GoogleApiError extends Error {
  constructor(status, message) {
    super(`HTTP ${status}: ${message}`);
    this.status = status;
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

/** Calls the token or revoke endpoint. Only error codes are ever shown, never the body. */
async function postForm(url, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const code = typeof body.error === "string" ? body.error : "unknown_error";
    const description = typeof body.error_description === "string" ? body.error_description : "";
    throw new GoogleApiError(response.status, description ? `${code} (${description})` : code);
  }
  return body;
}

function calendarApi(accessToken) {
  return async function call(method, path, { query, body } = {}) {
    const url = new URL(`${CALENDAR_API}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 204) return {};
    const json = await readJson(response);
    if (!response.ok) {
      const message = json?.error?.message ?? json?.raw ?? response.statusText;
      throw new GoogleApiError(response.status, message);
    }
    return json;
  };
}

// ---------------------------------------------------------------------------
// OAuth for an installed app: loopback redirect + PKCE (RFC 8252, RFC 7636)
// ---------------------------------------------------------------------------

const base64url = (buffer) => buffer.toString("base64url");

function sameSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Starts a one-shot listener on 127.0.0.1 at a free port and resolves with the code. */
async function waitForAuthorizationCode(expectedState) {
  let settle;
  const outcome = new Promise((resolvePromise, rejectPromise) => {
    settle = { resolve: resolvePromise, reject: rejectPromise };
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const finish = (status, text) =>
      response.writeHead(status, { "content-type": "text/plain; charset=utf-8" }).end(text);

    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!state || !sameSecret(state, expectedState)) {
      finish(400, "State mismatch. Close this tab and run the script again.");
      settle.reject(new SpikeError("The state parameter didn't match (possible CSRF)."));
    } else if (error) {
      finish(400, `Google answered "${error}". Close this tab and check the terminal.`);
      settle.reject(new SpikeError(`Consent wasn't given: ${error}.`));
    } else if (!code) {
      finish(400, "No authorization code. Close this tab and run the script again.");
      settle.reject(new SpikeError("The redirect had no authorization code."));
    } else {
      finish(
        200,
        "Restart spike S6: signed in. You can close this tab and go back to the terminal.",
      );
      settle.resolve(code);
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const timer = setTimeout(
    () => settle.reject(new SpikeError("No answer from the browser within 5 minutes.")),
    CONSENT_TIMEOUT_MS,
  );

  const close = () => {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  };
  return {
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    code: outcome.finally(close),
  };
}

function decodeIdTokenEmail(idToken) {
  // Only used to show which account consented; the token came straight from Google over TLS.
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString());
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

async function signIn(client) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(24));
  const listener = await waitForAuthorizationCode(state);

  const consentUrl = new URL(AUTH_URL);
  consentUrl.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: listener.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  console.log("\nOpen this URL in a browser on this computer, sign in and allow access:\n");
  console.log(`  ${consentUrl.toString()}\n`);
  console.log(
    'An unverified app shows "Google hasn\'t verified this app": choose Advanced → Go to ….',
  );
  console.log("Tick the Google Calendar permission if Google shows it as a checkbox.\n");
  console.log("Waiting for the browser (5 minutes)…\n");

  const code = await listener.code;
  const tokens = await postForm(TOKEN_URL, {
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: listener.redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });

  const granted = typeof tokens.scope === "string" ? tokens.scope.split(" ") : [];
  if (typeof tokens.access_token !== "string") fail("Google didn't return an access token.");
  if (!granted.includes(CALENDAR_SCOPE)) {
    fail("The calendar permission wasn't granted. Run again and tick it on the consent screen.");
  }
  if (typeof tokens.refresh_token !== "string") {
    fail("Google didn't return a refresh token (access_type=offline and prompt=consent were set).");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scope: granted,
    email: typeof tokens.id_token === "string" ? decodeIdTokenEmail(tokens.id_token) : null,
  };
}

async function refreshAccessToken(client, refreshToken) {
  const tokens = await postForm(TOKEN_URL, {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (typeof tokens.access_token !== "string") fail("Google didn't return an access token.");
  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Dates in a time zone, without dependencies
// ---------------------------------------------------------------------------

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** A calendar date as a UTC midnight Date, so arithmetic never crosses a DST change. */
function civilDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function todayIn(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return civilDate(get("year"), get("month"), get("day"));
}

/** Offset of `timeZone` at the instant `utcMs`, in milliseconds (local minus UTC). */
function offsetAt(timeZone, utcMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant of local midnight on `date` in `timeZone`, as RFC 3339. */
function localMidnightIso(date, timeZone) {
  const guess = date.getTime();
  let utc = guess - offsetAt(timeZone, guess);
  utc = guess - offsetAt(timeZone, utc); // second pass for days that start in a DST change
  return new Date(utc).toISOString();
}

const ymd = (date) => date.toISOString().slice(0, 10);
const pad = (value) => String(value).padStart(2, "0");
const weekdayName = (date) =>
  date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/** Local "YYYY-MM-DD" and "HH:MM" of an instance, from its dateTime in the calendar's zone. */
function localStart(instance) {
  const dateTime = instance?.originalStartTime?.dateTime ?? instance?.start?.dateTime ?? "";
  return { date: dateTime.slice(0, 10), time: dateTime.slice(11, 16), dateTime };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function step(label, run) {
  try {
    const detail = await run();
    report("PASS", label, detail);
    return true;
  } catch (error) {
    report("FAIL", label, errorMessage(error));
    return false;
  }
}

function skip(label) {
  report("SKIP", label, "Skipped because an earlier step failed.");
}

async function runFullTest(options) {
  const client = readClient();
  const previous = loadTokenFile(options.tokenFile);
  console.log(`S6 · Google Calendar with calendar.app.created (time zone ${options.tz})`);
  if (previous?.calendars.length) {
    console.log(
      `Note: ${previous.calendars.length} calendar(s) from earlier runs are still saved. ` +
        "They're kept, and --cleanup deletes them all.",
    );
  }

  const session = {};
  const steps = [
    "1. Sign in and consent",
    `2. Create the calendar "${CALENDAR_SUMMARY}"`,
    "3. Insert the recurring event",
    "4. Find the event by its habitId",
    "5. List next week's instances",
    "6. Patch one instance (✅ and green)",
    "7. EXDATE another instance",
    "8. Check the series after both changes",
  ];
  const state = { calendars: previous?.calendars ?? [] };

  const signedIn = await step(steps[0], async () => {
    Object.assign(session, await signIn(client));
    saveTokenFile(options.tokenFile, {
      version: 1,
      client_id: client.clientId,
      email: session.email,
      scope: session.scope,
      obtained_at: new Date().toISOString(),
      refresh_token: session.refreshToken,
      calendars: state.calendars,
    });
    return `${session.email ?? "account"}; granted: ${session.scope.join(" ")}; refresh token saved to ${options.tokenFile} (0600)`;
  });
  if (!signedIn) return finish(steps.slice(1));

  const api = calendarApi(session.accessToken);
  const habitId = `spike-${base64url(randomBytes(6))}`;
  const today = todayIn(options.tz);
  let firstDay = today;
  while (!BYDAY.has(firstDay.getUTCDay())) firstDay = addDays(firstDay, 1);
  // Next week runs from the Monday after today (a week later if today is Monday).
  const nextMonday = addDays(today, (8 - today.getUTCDay()) % 7 || 7);

  const created = await step(steps[1], async () => {
    const calendar = await api("POST", "/calendars", {
      body: {
        summary: CALENDAR_SUMMARY,
        description: "Created by scripts/spikes/s6-google-calendar.mjs. Safe to delete.",
        timeZone: options.tz,
      },
    });
    if (typeof calendar.id !== "string") fail("No calendar id in the response.");
    session.calendarId = calendar.id;
    state.calendars.push({
      id: calendar.id,
      created_at: new Date().toISOString(),
      time_zone: options.tz,
    });
    const saved = loadTokenFile(options.tokenFile);
    if (saved) saveTokenFile(options.tokenFile, { ...saved, calendars: state.calendars });
    if (calendar.timeZone !== options.tz) fail(`The calendar's time zone is ${calendar.timeZone}.`);
    return `id saved for --cleanup; time zone ${calendar.timeZone}`;
  });
  if (!created) return finish(steps.slice(2));

  const calendarPath = `/calendars/${encodeURIComponent(session.calendarId)}`;
  const startLocal = `${ymd(firstDay)}T${pad(START_HOUR)}:00:00`;
  const endLocal = `${ymd(firstDay)}T${pad(START_HOUR)}:${pad(DURATION_MIN)}:00`;

  const inserted = await step(steps[2], async () => {
    const event = await api("POST", `${calendarPath}/events`, {
      body: {
        summary: EVENT_SUMMARY,
        description: "Spike S6 test event (a habit at 07:00 on Mon, Tue, Thu and Fri).",
        start: { dateTime: startLocal, timeZone: options.tz },
        end: { dateTime: endLocal, timeZone: options.tz },
        recurrence: [RRULE],
        reminders: { useDefault: false },
        transparency: "transparent",
        extendedProperties: { private: { habitId } },
      },
    });
    if (typeof event.id !== "string") fail("No event id in the response.");
    session.eventId = event.id;
    const problems = [];
    if (event.reminders?.useDefault !== false) problems.push("reminders.useDefault isn't false");
    if (event.transparency !== "transparent") problems.push("transparency isn't transparent");
    if (event.extendedProperties?.private?.habitId !== habitId) problems.push("habitId missing");
    if (!event.recurrence?.includes(RRULE)) problems.push("recurrence changed");
    if (problems.length) fail(problems.join("; "));
    return `first occurrence ${weekdayName(firstDay)} ${pad(START_HOUR)}:00 (${options.tz}), ${DURATION_MIN} min, ${RRULE}`;
  });
  if (!inserted) return finish(steps.slice(3));

  await step(steps[3], async () => {
    const found = await api("GET", `${calendarPath}/events`, {
      query: { privateExtendedProperty: `habitId=${habitId}`, singleEvents: "false" },
    });
    const ids = (found.items ?? []).map((item) => item.id);
    if (!ids.includes(session.eventId)) fail(`Not found (got ${ids.length} event(s)).`);
    return `privateExtendedProperty=habitId=${habitId} → the series`;
  });

  const listInstances = async () => {
    const page = await api(
      "GET",
      `${calendarPath}/events/${encodeURIComponent(session.eventId)}/instances`,
      {
        query: {
          timeMin: localMidnightIso(nextMonday, options.tz),
          timeMax: localMidnightIso(addDays(nextMonday, 7), options.tz),
          timeZone: options.tz,
          maxResults: "50",
        },
      },
    );
    return page.items ?? [];
  };

  const expectedDays = [0, 1, 3, 4].map((offset) => ymd(addDays(nextMonday, offset)));
  const listed = await step(steps[4], async () => {
    const instances = await listInstances();
    session.instances = instances;
    const days = instances.map((instance) => localStart(instance).date);
    const times = new Set(instances.map((instance) => localStart(instance).time));
    if (days.join() !== expectedDays.join()) {
      fail(`Expected ${expectedDays.join(", ")}; got ${days.join(", ") || "none"}.`);
    }
    if (times.size !== 1 || !times.has(`${pad(START_HOUR)}:00`)) {
      fail(`Expected every instance at ${pad(START_HOUR)}:00 local; got ${[...times].join(", ")}.`);
    }
    return `${instances.length} instances: ${expectedDays.map((day) => weekdayName(new Date(`${day}T00:00:00Z`))).join(", ")}`;
  });
  if (!listed) return finish(steps.slice(5));

  // Monday is marked done; Thursday is excluded, like a paused day.
  const doneInstance = session.instances[0];
  const excludedInstance = session.instances[2];

  const patched = await step(steps[5], async () => {
    const result = await api(
      "PATCH",
      `${calendarPath}/events/${encodeURIComponent(doneInstance.id)}`,
      { body: { summary: `✅ ${EVENT_SUMMARY}`, colorId: GREEN_COLOR_ID } },
    );
    if (!result.summary?.startsWith("✅")) fail("The summary didn't change.");
    if (result.colorId !== GREEN_COLOR_ID) fail(`colorId is ${result.colorId ?? "unset"}.`);
    return `${weekdayName(new Date(`${localStart(doneInstance).date}T00:00:00Z`))}: "${result.summary}", colorId ${result.colorId}`;
  });

  const excluded = localStart(excludedInstance);
  // EXDATE uses the same form as DTSTART (local time with TZID), or Google ignores it.
  const exdate = `EXDATE;TZID=${options.tz}:${excluded.date.replaceAll("-", "")}T${excluded.time.replace(":", "")}00`;
  const exdated = await step(steps[6], async () => {
    const master = await api(
      "PATCH",
      `${calendarPath}/events/${encodeURIComponent(session.eventId)}`,
      {
        body: { recurrence: [RRULE, exdate] },
      },
    );
    if (!master.recurrence?.includes(exdate)) {
      fail(`The series' recurrence is ${JSON.stringify(master.recurrence ?? [])}.`);
    }
    return `${exdate} (start ${master.start?.dateTime} ${master.start?.timeZone})`;
  });

  if (!exdated) return finish(steps.slice(7));
  await step(steps[7], async () => {
    const instances = await listInstances();
    const days = instances.map((instance) => localStart(instance).date);
    const problems = [];
    if (days.includes(excluded.date)) problems.push(`${excluded.date} is still there`);
    if (instances.length !== 3) problems.push(`expected 3 instances, got ${instances.length}`);
    const done = instances.find((instance) => instance.id === doneInstance.id);
    if (patched && !done?.summary?.startsWith("✅")) {
      problems.push("the patched instance lost its ✅ after the recurrence changed");
    }
    if (problems.length) fail(problems.join("; "));
    return `${days.join(", ")}; the ✅ instance kept its name and color`;
  });

  return finish([]);
}

function finish(skipped) {
  for (const label of skipped) skip(label);
  const passed = results.filter((result) => result.status === "PASS").length;
  const ok = passed === results.length;
  console.log(`\nResult: ${passed}/${results.length} passed${ok ? "" : " (see FAIL lines)"}.`);
  if (ok) {
    console.log(
      "Look at the calendar in Google Calendar, then run --refresh-check after 8 days " +
        "(docs/spikes/S6-google-calendar.md).",
    );
  }
  return ok;
}

function formatAge(ms) {
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3_600_000);
  return `${days} day${days === 1 ? "" : "s"} ${hours} h`;
}

async function runRefreshCheck(options) {
  const client = readClient();
  const saved = loadTokenFile(options.tokenFile);
  if (!saved) fail(`No token file at ${options.tokenFile}. Run the full test first.`);
  if (saved.client_id && saved.client_id !== client.clientId) {
    console.log("Warning: GOOGLE_CLIENT_ID differs from the client that issued the saved token.");
  }

  const obtained = new Date(saved.obtained_at);
  const age = Date.now() - obtained.getTime();
  console.log("S6 · refresh token check");
  console.log(
    `Refresh token issued ${obtained.toISOString()} for ${saved.email ?? "the test account"}: ` +
      `${formatAge(age)} ago.\n`,
  );

  let accessToken;
  const refreshed = await step("Get a new access token with the saved refresh token", async () => {
    accessToken = await refreshAccessToken(client, saved.refresh_token);
    return "Google issued a new access token.";
  });
  if (!refreshed) {
    console.log(
      "\ninvalid_grant usually means the token expired or was revoked. If the app was in " +
        '"Testing" when you consented, tokens last 7 days: publish it "In production" and run ' +
        "the full test again.",
    );
    return finish([]);
  }

  const calendar = saved.calendars.at(-1);
  if (calendar) {
    await step("Use the access token (read the test calendar)", async () => {
      const result = await calendarApi(accessToken)(
        "GET",
        `/calendars/${encodeURIComponent(calendar.id)}`,
      );
      return `"${result.summary}" (${result.timeZone})`;
    });
  }

  if (age >= EIGHT_DAYS_MS) {
    report("PASS", "8-day check: the refresh token still works after more than 8 days");
  } else {
    const due = new Date(obtained.getTime() + EIGHT_DAYS_MS);
    report("WAIT", "8-day check", `Run --refresh-check again on or after ${due.toISOString()}.`);
  }
  const failed = results.some((result) => result.status === "FAIL");
  console.log(`\nResult: ${failed ? "FAIL" : "token works"}.`);
  return !failed;
}

async function runCleanup(options) {
  const client = readClient();
  const saved = loadTokenFile(options.tokenFile);
  if (!saved) fail(`No token file at ${options.tokenFile}. Nothing to clean up.`);
  console.log("S6 · cleanup");

  let accessToken;
  const refreshed = await step("Get an access token", async () => {
    accessToken = await refreshAccessToken(client, saved.refresh_token);
  });
  if (!refreshed) return finish([]);

  const remaining = [];
  if (options.cleanup) {
    if (!saved.calendars.length) console.log("  No calendars saved.");
    for (const calendar of saved.calendars) {
      const deleted = await step(`Delete calendar ${calendar.id}`, async () => {
        try {
          await calendarApi(accessToken)("DELETE", `/calendars/${encodeURIComponent(calendar.id)}`);
        } catch (error) {
          if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
            return "It was already gone.";
          }
          throw error;
        }
        return undefined;
      });
      if (!deleted) remaining.push(calendar);
    }
  }

  if (options.revoke) {
    if (remaining.length) {
      report(
        "SKIP",
        "Revoke the refresh token",
        "Some calendars couldn't be deleted; kept the token.",
      );
    } else {
      const revoked = await step("Revoke the refresh token", async () => {
        await postForm(REVOKE_URL, { token: saved.refresh_token });
      });
      if (revoked) {
        unlinkSync(options.tokenFile);
        console.log(`  Deleted ${options.tokenFile}.`);
        return finish([]);
      }
    }
  }

  if (options.cleanup) saveTokenFile(options.tokenFile, { ...saved, calendars: remaining });
  return finish([]);
}

// ---------------------------------------------------------------------------

async function main() {
  const options = readOptions();
  if (options.help) {
    console.log(HELP);
    return true;
  }
  if (options.refreshCheck) return runRefreshCheck(options);
  if (options.cleanup || options.revoke) return runCleanup(options);
  return runFullTest(options);
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (error) => {
    console.error(errorMessage(error));
    process.exit(1);
  },
);
