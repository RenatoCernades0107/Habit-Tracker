import type { NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { checkInsCsv, exportAll } from "@/server/data/export";
import { apiError, unauthorized } from "@/server/push/http";

/** GET /api/export?format=json|csv (FR-DAT-1, docs/spec/05-api.md §3). */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    return apiError(422, "validation_error", "format must be json or csv");
  }

  try {
    const data = await exportAll(await createClient());
    const day = data.exported_at.slice(0, 10);
    const headers = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="restart-${format === "csv" ? "check-ins" : "export"}-${day}.${format}"`,
    };
    if (format === "csv") {
      return new Response(checkInsCsv(data.habits, data.check_ins), {
        headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
      });
    }
    return new Response(JSON.stringify(data, null, 2), {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    console.error("[export] failed:", error instanceof Error ? error.name : typeof error);
    return apiError(500, "internal", "Export failed");
  }
}
