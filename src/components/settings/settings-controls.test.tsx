// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import commonEn from "@messages/en/common.json";
import settingsEn from "@messages/en/settings.json";

import { LanguageSetting } from "./language-setting";
import { ThemeSetting } from "./theme-setting";

const mocks = vi.hoisted(() => ({
  setUserLocale: vi.fn<(locale: string) => Promise<void>>(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  setTheme: vi.fn(),
  theme: "system" as string | undefined,
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/i18n/actions", () => ({ setUserLocale: mocks.setUserLocale }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mocks.theme, setTheme: mocks.setTheme }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ update: mocks.update }) }),
}));

beforeEach(() => {
  mocks.theme = "system";
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
});

afterEach(cleanup);

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: settingsEn, common: commonEn }}>
      <h2 id="heading">Section</h2>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("LanguageSetting", () => {
  it("shows each language in its own language and marks the current one", () => {
    renderWithIntl(<LanguageSetting labelledBy="heading" />);

    expect(screen.getByRole("group", { name: "Section" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    const spanish = screen.getByRole("button", { name: "Español" });
    expect(spanish).toHaveAttribute("aria-pressed", "false");
    expect(spanish).toHaveAttribute("lang", "es");
  });

  it("saves the new language, then re-renders the page", async () => {
    mocks.setUserLocale.mockResolvedValue(undefined);
    renderWithIntl(<LanguageSetting labelledBy="heading" />);

    fireEvent.click(screen.getByRole("button", { name: "Español" }));

    await waitFor(() => expect(mocks.setUserLocale).toHaveBeenCalledWith("es"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("says so when the language can't be saved", async () => {
    mocks.setUserLocale.mockRejectedValue(new Error("offline"));
    renderWithIntl(<LanguageSetting labelledBy="heading" />);

    fireEvent.click(screen.getByRole("button", { name: "Español" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(commonEn.errors.generic));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("ignores the language already in use", () => {
    renderWithIntl(<LanguageSetting labelledBy="heading" />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(mocks.setUserLocale).not.toHaveBeenCalled();
  });
});

describe("ThemeSetting", () => {
  it("marks the device's theme", () => {
    mocks.theme = "light";
    renderWithIntl(<ThemeSetting labelledBy="heading" userId="user-1" />);

    expect(screen.getByRole("group", { name: "Section" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the theme and saves only the theme to the profile", async () => {
    renderWithIntl(<ThemeSetting labelledBy="heading" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(mocks.setTheme).toHaveBeenCalledWith("dark");
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ theme: "dark" }));
    expect(mocks.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("keeps the theme when the profile can't be updated", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.eq.mockResolvedValue({ error: { code: "42501" } });
    renderWithIntl(<ThemeSetting labelledBy="heading" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Light" }));

    expect(mocks.setTheme).toHaveBeenCalledWith("light");
    await waitFor(() => expect(warn).toHaveBeenCalled());
  });

  it("does nothing for the theme already in use", () => {
    renderWithIntl(<ThemeSetting labelledBy="heading" userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(mocks.setTheme).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
