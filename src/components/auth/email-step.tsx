"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { GoogleIcon } from "./google-icon";
import type { Busy } from "./login-form";
import { useHydrated } from "./use-hydrated";

type EmailStepProps = {
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  onGoogle: () => void;
  busy: Busy;
  /** The email itself is the problem: mark the field invalid and focus it. */
  invalid: boolean;
  /** Id of the error message, for `aria-describedby`. */
  errorId?: string;
  /** Focus the field when this step appears (coming back from the code step). */
  autoFocus: boolean;
};

/** Step 1 (FR-ACC-1): the email field, plus Google sign-in. */
export function EmailStep({
  email,
  onEmailChange,
  onSubmit,
  onGoogle,
  busy,
  invalid,
  errorId,
  autoFocus,
}: EmailStepProps) {
  const t = useTranslations("auth");
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const hydrated = useHydrated();

  useEffect(() => {
    if (autoFocus || invalid) inputRef.current?.focus();
  }, [autoFocus, invalid]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy === null) onSubmit();
  }

  return (
    <div className="grid gap-5">
      {/* POST, and a submit button that stays disabled until hydration: a form sent before
          the page is interactive must never put the email in a URL (and in logs). */}
      <form method="post" onSubmit={handleSubmit} noValidate className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="login-email">{t("email.label")}</Label>
          <Input
            ref={inputRef}
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            required
            maxLength={254}
            placeholder={t("email.placeholder")}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={[invalid ? errorId : undefined, hintId].filter(Boolean).join(" ")}
          />
          <p id={hintId} className="text-sm text-muted-foreground">
            {t("email.description")}
          </p>
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full aria-disabled:cursor-wait aria-disabled:opacity-70"
          disabled={!hydrated}
          aria-disabled={busy !== null || undefined}
        >
          {busy === "send" && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy === "send" ? t("email.submitting") : t("email.submit")}
        </Button>
      </form>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground uppercase">{t("email.or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full aria-disabled:cursor-wait aria-disabled:opacity-70"
        disabled={!hydrated}
        aria-disabled={busy !== null || undefined}
        onClick={() => {
          if (busy === null) onGoogle();
        }}
      >
        {busy === "google" ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon className="size-5" />
        )}
        {busy === "google" ? t("google.submitting") : t("google.submit")}
      </Button>
    </div>
  );
}
