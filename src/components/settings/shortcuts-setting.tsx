"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicEnv } from "@/lib/env";
import { SHORTCUT_LINKS } from "@/lib/shortcuts";
import { createClient } from "@/lib/supabase/client";

type Token = {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
};

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Settings → Siri & Shortcuts (FR-SIR-1, FR-SIR-8, docs/spec/06-integrations.md §1.6): tokens,
 * install links, the steps, and a check that turns green after the first call.
 */
export function ShortcutsSetting() {
  const t = useTranslations("shortcuts.settings");
  const format = useFormatter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tokens = useQuery({
    queryKey: ["api-tokens"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("api_tokens")
        .select("id, name, token_prefix, last_used_at, created_at")
        .is("revoked_at", null)
        .order("created_at");
      if (error) throw error;
      return data as Token[];
    },
    gcTime: 0,
    // While a new token waits for its first call, check every few seconds (§1.6).
    refetchInterval: (q) =>
      q.state.data?.some((tk) => tk.last_used_at) || !created ? false : 4000,
  });
  const connected = tokens.data?.some((tk) => tk.last_used_at) ?? false;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.status === 429) toast.error(t("limit"));
      else if (!res.ok) toast.error(t("failed"));
      else {
        const body = (await res.json()) as { token: string };
        setCreated(body.token);
        setName("");
        void tokens.refetch();
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast(t("revoked"));
      void tokens.refetch();
    } else toast.error(t("failed"));
  };

  const server = getPublicEnv().NEXT_PUBLIC_APP_URL;

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t("steps.title")}</h3>
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          <li>{t("steps.one")}</li>
          <li>{t("steps.two")}</li>
          <li>{t("steps.three")}</li>
          <li>{t("steps.four")}</li>
        </ol>
        <p className="text-xs text-muted-foreground">{t("names")}</p>
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t("install")}</h3>
        {SHORTCUT_LINKS.es || SHORTCUT_LINKS.en ? (
          <div className="flex flex-wrap gap-2">
            {(["es", "en"] as const).map((lang) =>
              SHORTCUT_LINKS[lang] ? (
                <Button key={lang} asChild variant="outline">
                  <a href={SHORTCUT_LINKS[lang]!} lang={lang}>
                    {t(lang === "es" ? "installEs" : "installEn")}
                  </a>
                </Button>
              ) : null,
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("installSoon")}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("server")}: <code className="break-all">{server}</code>
        </p>
      </section>

      <section className="grid gap-3" aria-labelledby="tokens-title">
        <div className="flex items-center justify-between gap-2">
          <h3 id="tokens-title" className="text-sm font-semibold">
            {t("tokens")}
          </h3>
          <span role="status" className="text-sm">
            {connected ? t("connected") : created ? t("waiting") : null}
          </span>
        </div>

        {created ? (
          <div className="grid gap-2 rounded-lg border border-primary/40 bg-accent p-3">
            <p className="text-sm font-medium">{t("created")}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                {created}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void copy(created).then((ok) => ok && toast(t("copied")))}
              >
                <Copy aria-hidden="true" />
                {t("copy")}
              </Button>
            </div>
          </div>
        ) : null}

        {tokens.data && tokens.data.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {tokens.data.map((tk) => (
              <li key={tk.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {tk.last_used_at ? (
                  <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
                ) : (
                  <KeyRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {tk.name}{" "}
                    <code className="text-xs text-muted-foreground">{tk.token_prefix}…</code>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {tk.last_used_at
                      ? t("lastUsed", { date: format.relativeTime(new Date(tk.last_used_at)) })
                      : t("neverUsed")}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("revoke", { name: tk.name })}
                  onClick={() => void revoke(tk.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : tokens.data ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : null}

        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1">
            <Label htmlFor="token-name">{t("tokenName")}</Label>
            <Input
              id="token-name"
              value={name}
              maxLength={40}
              placeholder={t("tokenNamePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!name.trim() || busy}>
            <KeyRound aria-hidden="true" />
            {t("create")}
          </Button>
        </form>
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t("quick.title")}</h3>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
          <li>{t("quick.widget")}</li>
          <li>{t("quick.action")}</li>
          <li>{t("quick.backTap")}</li>
          <li>{t("quick.direct")}</li>
        </ul>
      </section>
    </div>
  );
}
