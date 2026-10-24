"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { RESEND_COOLDOWN_MS } from "@/lib/auth/pending-sign-in";
import { cn } from "@/lib/utils";

import type { Busy } from "./login-form";
import { useSecondsUntil } from "./use-seconds-until";

const CODE_LENGTH = 6;
const COOLDOWN_SECONDS = RESEND_COOLDOWN_MS / 1000;

type CodeStepProps = {
  email: string;
  /** When the current code was sent (epoch ms), for the resend cooldown. */
  sentAt: number;
  busy: Busy;
  invalid: boolean;
  errorId?: string;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeEmail: () => void;
};

/**
 * Step 2 (FR-ACC-1): the 6-digit code. Submits by itself once 6 digits are in, which also
 * covers iOS/Android one-time-code autofill. Remounted (cleared and refocused) after a
 * failed attempt.
 */
export function CodeStep({
  email,
  sentAt,
  busy,
  invalid,
  errorId,
  onVerify,
  onResend,
  onChangeEmail,
}: CodeStepProps) {
  const t = useTranslations("auth");
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const untilResend = useSecondsUntil(sentAt + RESEND_COOLDOWN_MS);
  // Clamped: `sentAt` is taken after the server answered, so the first tick can read 61.
  const secondsLeft = Math.min(COOLDOWN_SECONDS, untilResend);

  // Focus moves to the code as soon as this step appears.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy === null) onVerify(code);
  }

  const resendLabel =
    busy === "resend"
      ? t("code.resending")
      : secondsLeft > 0
        ? t("code.resendIn", { seconds: secondsLeft })
        : t("code.resend");

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {t.rich("code.description", {
          email,
          strong: (chunks) => (
            <strong className="font-medium break-all text-foreground">{chunks}</strong>
          ),
        })}
      </p>

      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        <div className="grid justify-items-center gap-2">
          <Label htmlFor="login-code" className="justify-self-start">
            {t("code.label")}
          </Label>
          <InputOTP
            ref={inputRef}
            id="login-code"
            name="code"
            maxLength={CODE_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={setCode}
            onComplete={(value: string) => {
              if (busy === null) onVerify(value);
            }}
            readOnly={busy === "verify"}
            aria-invalid={invalid || undefined}
            aria-describedby={[invalid ? errorId : undefined, hintId].filter(Boolean).join(" ")}
            containerClassName="justify-center"
          >
            {/* The real input above carries the value for assistive tech; the boxes are visual. */}
            <InputOTPGroup aria-hidden="true">
              {Array.from({ length: CODE_LENGTH }, (_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className={cn(invalid && "border-destructive")}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <p id={hintId} className="text-center text-sm text-muted-foreground">
            {t("code.spamHint")}
          </p>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full aria-disabled:cursor-wait aria-disabled:opacity-70"
          aria-disabled={busy !== null || undefined}
        >
          {busy === "verify" && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy === "verify" ? t("code.submitting") : t("code.submit")}
        </Button>
      </form>

      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="aria-disabled:opacity-60"
          aria-disabled={secondsLeft > 0 || busy !== null || undefined}
          onClick={() => {
            if (secondsLeft === 0 && busy === null) onResend();
          }}
        >
          {busy === "resend" && <Loader2 className="animate-spin" aria-hidden="true" />}
          <span className="tabular-nums">{resendLabel}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="aria-disabled:opacity-60"
          aria-disabled={busy === "verify" || undefined}
          onClick={() => {
            if (busy !== "verify") onChangeEmail();
          }}
        >
          {t("code.changeEmail")}
        </Button>
      </div>
    </div>
  );
}
