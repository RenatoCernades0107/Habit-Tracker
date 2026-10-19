import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/** Id of a section's heading, for controls labelled by it (`aria-labelledby`). */
export const sectionHeadingId = (id: string) => `${id}-title`;

/**
 * One Settings section: a card with a heading, a short description and its controls.
 * The `id` is the URL fragment other screens link to (e.g. /settings#notifications).
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const headingId = sectionHeadingId(id);

  return (
    // scroll-mt: room above the heading when jumping to #id, below the iPhone notch.
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-[calc(env(safe-area-inset-top)+1.5rem)]"
    >
      <Card className="gap-5">
        <CardHeader>
          <h2 id={headingId} className="text-lg leading-tight font-semibold">
            {title}
          </h2>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  );
}
