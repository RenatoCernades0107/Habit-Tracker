import { LanguageSwitcher } from "@/components/auth/language-switcher";

/** Signed-out screens: centered content, the language switcher, iPhone safe areas. */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col pt-safe pr-safe pb-safe pl-safe">
      <header className="flex justify-end px-4 pt-3 sm:px-6 sm:pt-4">
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
