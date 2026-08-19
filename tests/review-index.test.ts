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
    expect(new ReviewIndex(dir).getPane("/repo/a", "review")).toBeUndefined();
  });

  it("round-trips a pane id per worktree and key", () => {
    const index = new ReviewIndex(dir);
    index.setPane("/repo/a", "review", "pane-1");
    index.setPane("/repo/b", "review", "pane-2");
    expect(index.getPane("/repo/a", "review")).toBe("pane-1");
    expect(index.getPane("/repo/b", "review")).toBe("pane-2");
  });

  it("tracks multiple keys on the same worktree independently", () => {
    const index = new ReviewIndex(dir);
    index.setPane("/repo/a", "review", "pane-1");
    index.setPane("/repo/a", "review-pr:42", "pane-2");
    expect(index.getPane("/repo/a", "review")).toBe("pane-1");
    expect(index.getPane("/repo/a", "review-pr:42")).toBe("pane-2");
    expect(index.get("/repo/a")).toEqual({ panes: { review: "pane-1", "review-pr:42": "pane-2" } });
  });

  it("switching keys does not forget a still-live pane under another key", () => {
    // Codex-flagged: review -> review:pr -> review must not lose track of the first pane.
    const index = new ReviewIndex(dir);
    index.setPane("/repo/a", "review", "pane-1");
    index.setPane("/repo/a", "review-pr:99", "pane-2");
    index.setPane("/repo/a", "review-pr:42", "pane-3");
    expect(index.getPane("/repo/a", "review")).toBe("pane-1");
    expect(index.getPane("/repo/a", "review-pr:99")).toBe("pane-2");
    expect(index.getPane("/repo/a", "review-pr:42")).toBe("pane-3");
  });

  it("overwrites a key's pane when set again", () => {
    const index = new ReviewIndex(dir);
    index.setPane("/repo/a", "review", "pane-1");
    index.setPane("/repo/a", "review", "pane-2");
    expect(index.getPane("/repo/a", "review")).toBe("pane-2");
  });

  it("upsert merges agent fields without clobbering tracked panes", () => {
    const index = new ReviewIndex(dir);
    index.setPane("/repo/a", "review", "pane-1");
    index.upsert("/repo/a", { agentPaneId: "agent-1", agentName: "claude" });
    expect(index.get("/repo/a")).toEqual({
      panes: { review: "pane-1" },
      agentPaneId: "agent-1",
      agentName: "claude",
    });
  });

  it("clears a tracked worktree", () => {
    const index = new ReviewIndex(dir);
    index.setPane("/repo/a", "review", "pane-1");
    index.clear("/repo/a");
    expect(index.get("/repo/a")).toBeUndefined();
  });

  it("persists across separate instances over the same state dir", () => {
    new ReviewIndex(dir).setPane("/repo/a", "review", "pane-1");
    expect(new ReviewIndex(dir).getPane("/repo/a", "review")).toBe("pane-1");
  });

  describe("clearPaneById", () => {
    it("clears only the matching key, preserving other keys and agent tracking", () => {
      const index = new ReviewIndex(dir);
      index.setPane("/repo/a", "review", "pane-1");
      index.setPane("/repo/a", "review-pr:42", "pane-2");
      index.upsert("/repo/a", { agentPaneId: "agent-1", agentName: "claude" });

      index.clearPaneById("pane-1");

      expect(index.get("/repo/a")).toEqual({
        panes: { "review-pr:42": "pane-2" },
        agentPaneId: "agent-1",
        agentName: "claude",
      });
    });

    it("only clears the worktree whose paneId matches", () => {
      const index = new ReviewIndex(dir);
      index.setPane("/repo/a", "review", "pane-1");
      index.setPane("/repo/b", "review", "pane-2");
      index.clearPaneById("pane-1");
      expect(index.get("/repo/a")).toEqual({ panes: {} });
      expect(index.get("/repo/b")).toEqual({ panes: { review: "pane-2" } });
    });

    it("is a no-op when no entry matches", () => {
      const index = new ReviewIndex(dir);
      index.setPane("/repo/a", "review", "pane-1");
      index.clearPaneById("pane-nonexistent");
      expect(index.get("/repo/a")).toEqual({ panes: { review: "pane-1" } });
    });
  });
});
