import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReviewIndex } from "../src/review-index.js";

describe("ReviewIndex", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wiff-review-index-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined for an untracked worktree", () => {
    expect(new ReviewIndex(dir).get("/repo/a")).toBeUndefined();
  });

  it("round-trips a pane id per worktree", () => {
    const index = new ReviewIndex(dir);
    index.upsert("/repo/a", { paneId: "pane-1" });
    index.upsert("/repo/b", { paneId: "pane-2" });
    expect(index.get("/repo/a")).toEqual({ paneId: "pane-1" });
    expect(index.get("/repo/b")).toEqual({ paneId: "pane-2" });
  });

  it("merges patches without clobbering fields left undefined", () => {
    const index = new ReviewIndex(dir);
    index.upsert("/repo/a", { paneId: "pane-1" });
    index.upsert("/repo/a", { agentPaneId: "agent-1", agentName: "claude" });
    expect(index.get("/repo/a")).toEqual({
      paneId: "pane-1",
      agentPaneId: "agent-1",
      agentName: "claude",
    });
  });

  it("overwrites a field when patched again", () => {
    const index = new ReviewIndex(dir);
    index.upsert("/repo/a", { paneId: "pane-1" });
    index.upsert("/repo/a", { paneId: "pane-2" });
    expect(index.get("/repo/a")?.paneId).toBe("pane-2");
  });

  it("clears a tracked worktree", () => {
    const index = new ReviewIndex(dir);
    index.upsert("/repo/a", { paneId: "pane-1" });
    index.clear("/repo/a");
    expect(index.get("/repo/a")).toBeUndefined();
  });

  it("persists across separate instances over the same state dir", () => {
    new ReviewIndex(dir).upsert("/repo/a", { paneId: "pane-1" });
    expect(new ReviewIndex(dir).get("/repo/a")).toEqual({ paneId: "pane-1" });
  });
});
