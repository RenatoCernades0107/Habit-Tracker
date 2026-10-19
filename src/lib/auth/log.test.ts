import { AuthApiError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { loggableError } from "./log";

describe("loggableError", () => {
  it("keeps name, code and status but never the message", () => {
    const error = new AuthApiError("ana@example.com is banned", 400, "user_banned");
    const logged = loggableError(error);
    expect(logged).toBe("AuthApiError user_banned 400");
    expect(logged).not.toContain("ana@example.com");
  });

  it("handles plain values", () => {
    expect(loggableError(new Error("secret"))).toBe("Error");
    expect(loggableError({})).toBe("unknown error");
    expect(loggableError("oops")).toBe("string");
    expect(loggableError(null)).toBe("object");
  });
});
