// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import authEn from "@messages/en/auth.json";
import commonEn from "@messages/en/common.json";
import { pendingSignInStore } from "@/lib/auth/pending-sign-in";

import { LoginForm } from "./login-form";

const actions = vi.hoisted(() => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
}));
const google = vi.hoisted(() => ({ startGoogleSignIn: vi.fn() }));

vi.mock("@/app/(auth)/login/actions", () => actions);
vi.mock("@/lib/auth/google", () => google);

beforeAll(() => {
  // jsdom lacks these; input-otp uses them for layout only.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  document.elementFromPoint ??= () => null;
});

beforeEach(() => {
  actions.sendCode.mockResolvedValue({ ok: true });
  actions.verifyCode.mockResolvedValue({ ok: false, error: "invalidCode" });
  google.startGoogleSignIn.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  act(() => pendingSignInStore.clear());
});

function renderForm(props: Partial<Parameters<typeof LoginForm>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ auth: authEn, common: commonEn }}>
      <LoginForm next="/today" {...props} />
    </NextIntlClientProvider>,
  );
}

async function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
}

describe("LoginForm", () => {
  it("rejects an invalid email without calling the server", async () => {
    renderForm();
    await submitEmail("not-an-email");

    expect(await screen.findByRole("alert")).toHaveTextContent(authEn.errors.invalidEmail);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(actions.sendCode).not.toHaveBeenCalled();
  });

  it("sends the code with device hints and moves focus to the code", async () => {
    renderForm();
    await submitEmail("  ana@restart.test ");

    const code = await screen.findByLabelText("6-digit code");
    expect(actions.sendCode).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ana@restart.test", timeZone: expect.any(String) }),
    );
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    await waitFor(() => expect(code).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("Code sent to ana@restart.test.");
    expect(screen.getByText("ana@restart.test")).toBeInTheDocument();
  });

  it("shows the resend cooldown", async () => {
    renderForm();
    await submitEmail("ana@restart.test");

    const resend = await screen.findByRole("button", { name: /Resend code in \d+ s/ });
    expect(resend).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(resend);
    expect(actions.sendCode).toHaveBeenCalledTimes(1);
  });

  it("auto-submits 6 digits and shows a friendly error for a wrong code", async () => {
    renderForm({ next: "/stats" });
    await submitEmail("ana@restart.test");
    const code = await screen.findByLabelText("6-digit code");

    fireEvent.change(code, { target: { value: "123456" } });

    await waitFor(() =>
      expect(actions.verifyCode).toHaveBeenCalledWith(
        expect.objectContaining({ email: "ana@restart.test", code: "123456", next: "/stats" }),
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(authEn.errors.invalidCode);
    // Cleared and focused again for the next try.
    const retry = screen.getByLabelText("6-digit code");
    expect(retry).toHaveValue("");
    expect(retry).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(retry).toHaveFocus());
  });

  it("treats the action's redirect as success and forgets the attempt", async () => {
    let redirectError: unknown;
    try {
      redirect("/today");
    } catch (error) {
      redirectError = error;
    }
    actions.verifyCode.mockRejectedValueOnce(redirectError);
    renderForm();
    await submitEmail("ana@restart.test");
    fireEvent.change(await screen.findByLabelText("6-digit code"), {
      target: { value: "654321" },
    });

    await waitFor(() => expect(pendingSignInStore.getSnapshot()).toBeNull());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Still on the code step, busy, while the router navigates.
    expect(screen.getByRole("button", { name: /Signing in/ })).toBeInTheDocument();
  });

  it("goes back to the email step with the email filled in", async () => {
    renderForm();
    await submitEmail("ana@restart.test");
    await screen.findByLabelText("6-digit code");

    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));

    const email = await screen.findByLabelText("Email");
    expect(email).toHaveValue("ana@restart.test");
    await waitFor(() => expect(email).toHaveFocus());
  });

  it("restores the code step after a reload", async () => {
    act(() => pendingSignInStore.save({ email: "ana@restart.test", sentAt: Date.now() }));
    renderForm();
    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
  });

  it("maps server errors and network failures", async () => {
    actions.sendCode.mockResolvedValueOnce({ ok: false, error: "rateLimited" });
    renderForm();
    await submitEmail("ana@restart.test");
    expect(await screen.findByRole("alert")).toHaveTextContent(authEn.errors.rateLimited);

    actions.sendCode.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(authEn.errors.network));
  });

  it("shows when Google sign-in isn't available", async () => {
    google.startGoogleSignIn.mockResolvedValueOnce("googleUnavailable");
    renderForm({ next: "/habits" });

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(authEn.errors.googleUnavailable);
    expect(google.startGoogleSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ next: "/habits" }),
    );
  });

  it("shows an error passed from the OAuth callback", () => {
    renderForm({ initialError: "googleCancelled" });
    expect(screen.getByRole("alert")).toHaveTextContent(authEn.errors.googleCancelled);
  });
});
