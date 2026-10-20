import Link from "next/link";

/** The Restart mark and name, linking to Today. Shown at the top of the desktop sidebar. */
export function BrandLink({ name }: { name: string }) {
  return (
    <Link
      href="/today"
      className="flex min-h-11 items-center gap-3 rounded-md px-2 text-lg font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      {/* A plain <img>: the icon is a static PWA file the service worker caches, so it works
          offline, unlike an optimized /_next/image URL. Decorative: the name is next to it,
          and if the file is missing the name still reads fine. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={32}
        height={32}
        decoding="async"
        className="size-8 shrink-0 rounded-lg"
      />
      <span>{name}</span>
    </Link>
  );
}
