/**
 * Error details that are safe to log: name, code and HTTP status only. Messages can contain
 * emails, and logs never hold emails or tokens (docs/spec/03-architecture.md §10).
 */
export function loggableError(error: unknown): string {
  if (error && typeof error === "object") {
    const { name, code, status } = error as { name?: unknown; code?: unknown; status?: unknown };
    const parts = [name, code, status].filter((part) => part !== undefined && part !== "");
    return parts.length > 0 ? parts.join(" ") : "unknown error";
  }
  return typeof error;
}
