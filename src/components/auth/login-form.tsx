"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, useSyncExternalStore, useTransition } from "react";

import { sendCode, verifyCode, type SendCodeResult } from "@/app/(auth)/login/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mapAuthError, type AuthErrorKey } from "@/lib/auth/errors";
import { startGoogleSignIn } from "@/lib/auth/google";
import {
  parsePendingSignIn,
  pendingSignInStore,
  type PendingSignIn,
} from "@/lib/auth/pending-sign-in";
import { detectWeekStart } from "@/lib/auth/week-start";

import { CodeStep } from "./code-step";
import { EmailStep } from "./email-step";
import { isNextNavigation } from "./is-next-navigation";

/** The action in flight, if any. Only one at a time. */
export type Busy = "send" | "resend" | "verify" | "google" | null;

// A quick check before calling the server, which validates properly (zod).
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIX_DIGITS = /^\d{6}$/;

/** Hints for a new profile (FR-ACC-2), read from this device when the user acts. */
function deviceHints() {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekStart: detectWeekStart(navigator.language),
  };
}

type LoginFormProps = {
  /** Safe same-origin path to continue to after signing in. */
  next: string;
  /** Message from a failed Google sign-in (/login?error=…). */
  initialError?: AuthErrorKey;
};

/**
 * Sign-in in two steps (docs/spec/03-architecture.md §6, FR-ACC-1): email → 6-digit code,
 * or Google. The code step is restored after a reload while the code is fresh.
 */
export function LoginForm({ next, initialError }: LoginFormProps) {
  const t = useTranslations("auth");
  const errorId = useId();

  const stored = useSyncExternalStore(
    pendingSignInStore.subscribe,
    pendingSignInStore.getSnapshot,
    pendingSignInStore.getServerSnapshot,
  );
  const pending = useMemo(() => parsePendingSignIn(stored), [stored]);
  // Keeps the code step on screen while the app navigates away after a successful sign-in,
  // after the stored attempt has already been cleared.
  const [signingIn, setSigningIn] = useState<PendingSignIn | null>(null);
  const attempt = signingIn ?? pending;

  const [email, setEmail] = useState("");
  const [error, setError] = useState<{ key: AuthErrorKey; seq: number } | null>(
    initialError ? { key: initialError, seq: 0 } : null,
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [cameBack, setCameBack] = useState(false);
  const [codeAttempt, setCodeAttempt] = useState(0);
  const [, startTransition] = useTransition();

  function showError(key: AuthErrorKey) {
    setStatus("");
    setError((current) => ({ key, seq: (current?.seq ?? 0) + 1 }));
  }

  // Back from Google via the browser's Back button: the page may come from the bfcache
  // with the spinner still on.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function requestCode(target: string, kind: "send" | "resend") {
    if (!navigator.onLine) return showError("network");
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      let result: SendCodeResult;
      try {
        result = await sendCode({ email: target, ...deviceHints() });
      } catch (thrown) {
        result = { ok: false, error: mapAuthError(thrown, "send") };
      }
      setBusy(null);
      if (!result.ok) return showError(result.error);
      pendingSignInStore.save({ email: target, sentAt: Date.now() });
      setCodeAttempt((n) => n + 1);
      setStatus(kind === "send" ? t("status.codeSent", { email: target }) : t("status.codeResent"));
    });
  }

  function handleSendCode() {
    const target = email.trim();
    if (!LOOKS_LIKE_EMAIL.test(target)) return showError("invalidEmail");
    requestCode(target, "send");
  }

  function handleVerify(code: string) {
    if (!attempt) return;
    if (!SIX_DIGITS.test(code)) return showError("codeFormat");
    if (!navigator.onLine) return showError("network");
    const current = attempt;
    setError(null);
    setBusy("verify");
    setStatus(t("status.verifying"));
    startTransition(async () => {
      try {
        const result = await verifyCode({ email: current.email, code, next, ...deviceHints() });
        if (result && !result.ok) {
          setBusy(null);
          setCodeAttempt((n) => n + 1); // Clears and refocuses the code.
          return showError(result.error);
        }
      } catch (thrown) {
        if (!isNextNavigation(thrown)) {
          setBusy(null);
          setCodeAttempt((n) => n + 1);
          return showError(mapAuthError(thrown, "verify"));
        }
      }
      // Signed in: the action redirected and the router is navigating. Forget the attempt
      // so a later visit to /login starts fresh, but keep this screen until the page changes.
      setSigningIn(current);
      pendingSignInStore.clear();
    });
  }

  function handleChangeEmail() {
    if (attempt) setEmail(attempt.email);
    pendingSignInStore.clear();
    setError(null);
    setStatus("");
    setCameBack(true);
  }

  function handleGoogle() {
    if (!navigator.onLine) return showError("network");
    pendingSignInStore.clear();
    setError(null);
    setBusy("google");
    void startGoogleSignIn({ next, weekStart: deviceHints().weekStart }).then((failure) => {
      // On success the browser is already leaving for Google; keep the spinner.
      if (failure) {
        setBusy(null);
        showError(failure);
      }
    });
  }

  const errorKey = error?.key;
  const emailInvalid = errorKey === "invalidEmail";
  const codeInvalid = errorKey === "invalidCode" || errorKey === "codeFormat";

  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-5 sm:px-6">
        <CardTitle>
          <h2 className="text-xl font-semibold">{attempt ? t("code.title") : t("email.title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 px-5 sm:px-6">
        {error && (
          <Alert key={error.seq} id={errorId} variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{t(`errors.${error.key}`)}</AlertDescription>
          </Alert>
        )}

        {attempt ? (
          <CodeStep
            key={`${attempt.email}:${codeAttempt}`}
            email={attempt.email}
            sentAt={attempt.sentAt}
            busy={busy}
            invalid={codeInvalid}
            errorId={error ? errorId : undefined}
            onVerify={handleVerify}
            onResend={() => requestCode(attempt.email, "resend")}
            onChangeEmail={handleChangeEmail}
          />
        ) : (
          <EmailStep
            email={email}
            onEmailChange={setEmail}
            onSubmit={handleSendCode}
            onGoogle={handleGoogle}
            busy={busy}
            invalid={emailInvalid}
            errorId={error ? errorId : undefined}
            autoFocus={cameBack}
          />
        )}

        {/* Progress for screen readers; errors are announced by the alert above. */}
        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
      </CardContent>
    </Card>
  );
}
