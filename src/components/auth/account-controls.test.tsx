// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import authEn from "@messages/en/auth.json";
import commonEn from "@messages/en/common.json";

import { LanguageSwitcher } from "./language-switcher";
import { SignOutButton } from "./sign-out-button";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
  setUserLocale: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/auth/actions", () => ({
  signOut: mocks.signOut,
  signOutEverywhere: mocks.signOutEverywhere,
}));
vi.mock("@/i18n/actions", () => ({ setUserLocale: mocks.setUserLocale }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));

afterEach(cleanup);

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ auth: authEn, common: commonEn }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("LanguageSwitcher", () => {
  it("marks the current language and switches", async () => {
    mocks.setUserLocale.mockResolvedValue(undefined);
    renderWithIntl(<LanguageSwitcher />);

    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    const spanish = screen.getByRole("button", { name: "Español" });
    expect(spanish).toHaveAttribute("lang", "es");

    fireEvent.click(spanish);
    await waitFor(() => expect(mocks.setUserLocale).toHaveBeenCalledWith("es"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("does nothing for the current language", () => {
    renderWithIntl(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(mocks.setUserLocale).not.toHaveBeenCalledWith("en");
  });
});

describe("SignOutButton", () => {
  it("signs out of this device", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    renderWithIntl(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.signOutEverywhere).not.toHaveBeenCalled();
  });

  it("reports a failed sign-out of all devices", async () => {
    mocks.signOutEverywhere.mockRejectedValue(new Error("Could not sign out"));
    renderWithIntl(<SignOutButton everywhere />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(authEn.signOut.everywhereFailed),
    );
  });
});
