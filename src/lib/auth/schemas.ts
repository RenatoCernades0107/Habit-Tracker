import { z } from "zod";

import { isValidTimeZone } from "@/i18n/config";

import { parseWeekStart } from "./week-start";

/** Trimmed and lower-cased, so "Ana@Mail.com " and "ana@mail.com" are one account. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** The 6-digit email code (supabase/config.toml: otp_length = 6). */
export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

// Device hints for a new profile (FR-ACC-2). Bad values are dropped, not errors: they
// come from the browser and must never block signing in.
const timeZoneHint = z
  .unknown()
  .transform((v) => (isValidTimeZone(v) ? v : undefined))
  .optional();
const weekStartHint = z.unknown().transform(parseWeekStart).optional();

export const sendCodeSchema = z.object({
  email: emailSchema,
  timeZone: timeZoneHint,
  weekStart: weekStartHint,
});

export const verifyCodeSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  next: z.string().max(2048).optional(),
  timeZone: timeZoneHint,
  weekStart: weekStartHint,
});

/** What the login form sends. Validated on the server; never trusted as typed. */
export type SendCodeInput = {
  email: string;
  timeZone?: string;
  weekStart?: number;
};

export type VerifyCodeInput = SendCodeInput & {
  code: string;
  next?: string;
};
