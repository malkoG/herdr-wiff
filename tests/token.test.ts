import { describe, expect, it, vi } from "vitest";
import { getForgeToken, type TokenRunner } from "../src/token.js";

describe("getForgeToken", () => {
  it("returns the trimmed stdout as the token on success", () => {
    const run: TokenRunner = vi.fn().mockReturnValue({ status: 0, stdout: "ghp_abc123\n", stderr: "" });
    const result = getForgeToken("gh auth token", run);
    expect(result).toEqual({ ok: true, token: "ghp_abc123" });
  });

  it("runs the exact configured command", () => {
    const run: TokenRunner = vi.fn().mockReturnValue({ status: 0, stdout: "t", stderr: "" });
    getForgeToken("gh auth token", run);
    expect(run).toHaveBeenCalledWith("gh auth token");
  });

  it("fails with a clear message on non-zero exit", () => {
    const run: TokenRunner = vi
      .fn()
      .mockReturnValue({ status: 1, stdout: "", stderr: "gh: not authenticated" });
    const result = getForgeToken("gh auth token", run);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("gh auth token");
      expect(result.message).toContain("gh: not authenticated");
    }
  });

  it("fails when the command succeeds but produces no output", () => {
    const run: TokenRunner = vi.fn().mockReturnValue({ status: 0, stdout: "   \n", stderr: "" });
    const result = getForgeToken("gh auth token", run);
    expect(result.ok).toBe(false);
  });
});
