import { describe, expect, it, vi } from "vitest";
import { GhAdapter, type GhRunner } from "../src/gh.js";

describe("GhAdapter.currentPrNumber", () => {
  it("returns the PR number on success", () => {
    const run: GhRunner = vi.fn().mockReturnValue({ status: 0, stdout: '{"number": 42}' });
    const gh = new GhAdapter("gh", run);
    expect(gh.currentPrNumber("/repo/wt")).toBe(42);
    expect(run).toHaveBeenCalledWith(["pr", "view", "--json", "number"], { cwd: "/repo/wt" });
  });

  it("returns null when there is no PR for the branch (non-zero exit)", () => {
    const run: GhRunner = vi.fn().mockReturnValue({ status: 1, stdout: "" });
    const gh = new GhAdapter("gh", run);
    expect(gh.currentPrNumber("/repo/wt")).toBeNull();
  });

  it("returns null on unparseable output", () => {
    const run: GhRunner = vi.fn().mockReturnValue({ status: 0, stdout: "not json" });
    const gh = new GhAdapter("gh", run);
    expect(gh.currentPrNumber("/repo/wt")).toBeNull();
  });

  it("returns null when the JSON has no numeric number field", () => {
    const run: GhRunner = vi.fn().mockReturnValue({ status: 0, stdout: "{}" });
    const gh = new GhAdapter("gh", run);
    expect(gh.currentPrNumber("/repo/wt")).toBeNull();
  });
});
