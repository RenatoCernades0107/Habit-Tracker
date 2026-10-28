import "server-only";

import { type ServerEnv, serverEnvInput, serverEnvIssues, serverSchema } from "@/lib/env.schema";

export type { ServerEnv };

/**
 * Thrown when a server variable is missing or invalid. `code` lists the variable names so
 * the routes' existing error logs (name + code) say which one, never its value.
 */
export class ServerEnvError extends Error {
  readonly code: string;

  constructor(issues: { name: string; problem: string }[]) {
    super(
      `Invalid server environment: ${issues.map((i) => `${i.name} (${i.problem})`).join(", ")}`,
    );
    this.name = "ServerEnvError";
    this.code = issues.map((i) => i.name).join(",");
  }
}

let serverEnv: ServerEnv | undefined;

/** Server-only secrets. Validated on first use. Never import this from client code. */
export function getServerEnv(): ServerEnv {
  if (serverEnv) return serverEnv;
  const result = serverSchema.safeParse(serverEnvInput(process.env));
  if (!result.success) {
    const error = new ServerEnvError(serverEnvIssues(result.error));
    // Logged here too because some callers (the settings page) catch it to degrade quietly.
    console.error(`[env] ${error.message}`);
    throw error;
  }
  serverEnv = result.data;
  return serverEnv;
}
