import { describe, expect, it } from "vitest";

import { emailSchema, otpCodeSchema, sendCodeSchema, verifyCodeSchema } from "./schemas";

describe("emailSchema", () => {
  it("trims and lower-cases", () => {
    expect(emailSchema.parse("  Ana+Test@Restart.TEST ")).toBe("ana+test@restart.test");
  });

  it.each(["", "ana", "ana@", "@restart.test", "ana @restart.test", `${"a".repeat(250)}@x.co`])(
    "rejects %j",
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("otpCodeSchema", () => {
  it("accepts six digits", () => {
    expect(otpCodeSchema.parse("012345")).toBe("012345");
    expect(otpCodeSchema.parse(" 987654 ")).toBe("987654");
  });

  it.each(["12345", "1234567", "12345a", "12 345", "", "１２３４５６"])("rejects %j", (value) => {
    expect(otpCodeSchema.safeParse(value).success).toBe(false);
  });
});

describe("sendCodeSchema", () => {
  it("keeps valid device hints", () => {
    expect(
      sendCodeSchema.parse({ email: "a@b.co", timeZone: "America/Lima", weekStart: 7 }),
    ).toEqual({ email: "a@b.co", timeZone: "America/Lima", weekStart: 7 });
  });

  it("drops invalid device hints instead of failing", () => {
    expect(
      sendCodeSchema.parse({ email: "a@b.co", timeZone: "Mars/Olympus", weekStart: 6 }),
    ).toEqual({ email: "a@b.co", timeZone: undefined, weekStart: undefined });
    expect(sendCodeSchema.parse({ email: "a@b.co" })).toEqual({
      email: "a@b.co",
      timeZone: undefined,
      weekStart: undefined,
    });
  });

  it("rejects a bad email", () => {
    expect(sendCodeSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("verifyCodeSchema", () => {
  it("parses a complete input", () => {
    expect(
      verifyCodeSchema.parse({ email: "A@B.co", code: "123456", next: "/stats", weekStart: "1" }),
    ).toEqual({
      email: "a@b.co",
      code: "123456",
      next: "/stats",
      timeZone: undefined,
      weekStart: 1,
    });
  });

  it("rejects a malformed code", () => {
    expect(verifyCodeSchema.safeParse({ email: "a@b.co", code: "12" }).success).toBe(false);
  });
});
