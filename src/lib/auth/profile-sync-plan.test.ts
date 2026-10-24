import { describe, expect, it } from "vitest";

import { planProfileSync, type ProfileSnapshot } from "./profile-sync-plan";

const fresh: ProfileSnapshot = {
  locale: "en",
  timezone: "UTC",
  week_start: 1,
  onboarding_completed_at: null,
};

const onboarded: ProfileSnapshot = {
  locale: "es",
  timezone: "America/Lima",
  week_start: 7,
  onboarding_completed_at: "2026-10-01T12:00:00Z",
};

describe("planProfileSync before onboarding", () => {
  it("copies the device's language, timezone and week start", () => {
    expect(
      planProfileSync(fresh, {
        cookieLocale: "es",
        timeZone: "America/Lima",
        weekStart: 7,
      }),
    ).toEqual({
      kind: "update",
      values: { locale: "es", timezone: "America/Lima", week_start: 7 },
    });
  });

  it("uses Accept-Language when there's no language cookie", () => {
    expect(planProfileSync(fresh, { acceptLanguage: "es-PE,es;q=0.9,en;q=0.5" })).toEqual({
      kind: "update",
      values: { locale: "es" },
    });
  });

  it("ignores an invalid cookie and timezone", () => {
    expect(
      planProfileSync(fresh, { cookieLocale: "fr", acceptLanguage: "fr", timeZone: "Nope/Nope" }),
    ).toEqual({ kind: "none" });
  });

  it("writes only what changed", () => {
    expect(
      planProfileSync(
        { ...fresh, locale: "es", timezone: "America/Lima" },
        { cookieLocale: "es", timeZone: "America/Lima", weekStart: 7 },
      ),
    ).toEqual({ kind: "update", values: { week_start: 7 } });
  });

  it("does nothing when everything matches", () => {
    expect(planProfileSync(fresh, { cookieLocale: "en", timeZone: "UTC", weekStart: 1 })).toEqual({
      kind: "none",
    });
  });
});

describe("planProfileSync after onboarding", () => {
  it("never changes the profile and restores its language on this device", () => {
    expect(
      planProfileSync(onboarded, {
        cookieLocale: "en",
        timeZone: "Europe/Madrid",
        weekStart: 1,
      }),
    ).toEqual({ kind: "setLocaleCookie", locale: "es" });
  });

  it("sets the cookie when there is none", () => {
    expect(planProfileSync(onboarded, {})).toEqual({ kind: "setLocaleCookie", locale: "es" });
  });

  it("does nothing when the cookie already matches", () => {
    expect(planProfileSync(onboarded, { cookieLocale: "es" })).toEqual({ kind: "none" });
  });

  it("does nothing if the stored locale is unexpected", () => {
    expect(planProfileSync({ ...onboarded, locale: "fr" }, {})).toEqual({ kind: "none" });
  });
});
