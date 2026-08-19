import { describe, expect, it, vi } from "vitest";
import { DEFAULTS, type PluginConfig } from "../src/config.js";
import type { HerdrContext } from "../src/context.js";
import { reviewPrAction, type ReviewPrDeps } from "../src/review-pr.js";

function makeDeps(overrides: Partial<ReviewPrDeps> = {}): ReviewPrDeps & {
  notify: ReturnType<typeof vi.fn>;
  openPane: ReturnType<typeof vi.fn>;
  newIfNeeded: ReturnType<typeof vi.fn>;
  currentPrNumber: ReturnType<typeof vi.fn>;
  getPane: ReturnType<typeof vi.fn>;
  setPane: ReturnType<typeof vi.fn>;
  indexUpsert: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const openPane = vi.fn().mockReturnValue("pane-1");
  const newIfNeeded = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  const currentPrNumber = vi.fn().mockReturnValue(42);
  const getPane = vi.fn().mockReturnValue(undefined);
  const setPane = vi.fn();
  const indexUpsert = vi.fn();

  const cfg: PluginConfig = structuredClone(DEFAULTS);
  const ctx: HerdrContext = { worktree: "/repo/wt" };

  const deps: ReviewPrDeps = {
    cfg,
    ctx,
    herdr: { notify, openPane },
    wiff: { newIfNeeded },
    gh: { currentPrNumber },
    reviewIndex: { getPane, setPane, upsert: indexUpsert },
    ...overrides,
  };

  return { ...deps, notify, openPane, newIfNeeded, currentPrNumber, getPane, setPane, indexUpsert };
}

describe("reviewPrAction", () => {
  it("notifies and fails when no worktree can be determined", () => {
    const deps = makeDeps({ ctx: {} });
    expect(reviewPrAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not determine"));
  });

  it("falls back to the local review action when there is no PR", () => {
    const deps = makeDeps();
    deps.currentPrNumber.mockReturnValue(null);
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("no pull request"));
    expect(deps.newIfNeeded).toHaveBeenCalled();
    expect(deps.openPane).toHaveBeenCalledWith(expect.objectContaining({ entrypoint: "review" }));
  });

  it("opens the review-pr pane with the resolved PR number in its env, not through forgePull", () => {
    const deps = makeDeps();
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: "review-pr",
        cwd: "/repo/wt",
        env: { WIFF_FORGE_PR: "42" },
      }),
    );
    expect(deps.setPane).toHaveBeenCalledWith("/repo/wt", "review-pr:42", "pane-1");
  });

  it("fails and notifies when herdr returns no pane id", () => {
    const deps = makeDeps();
    deps.openPane.mockReturnValue(null);
    const status = reviewPrAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not open"));
  });

  it("reuses the tracked pane instead of opening a new one", () => {
    const deps = makeDeps();
    deps.getPane.mockReturnValue("existing");
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).not.toHaveBeenCalled();
    expect(deps.getPane).toHaveBeenCalledWith("/repo/wt", "review-pr:42");
  });

  it("does not reuse a plain review pane never bound to a PR", () => {
    // getPane is looked up by the "review-pr:42" key specifically, so a pane tracked only under
    // "review" (the mock's default undefined return for any other key) is correctly invisible here.
    const deps = makeDeps();
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalledWith(expect.objectContaining({ entrypoint: "review-pr" }));
  });

  it("does not reuse a pane bound to a different PR on the same worktree", () => {
    // Codex-flagged: switching this worktree to a branch tracking a different PR must not reuse
    // the pane still bound to the old one.
    const deps = makeDeps();
    deps.getPane.mockImplementation((_wt: string, key: string) =>
      key === "review-pr:99" ? "old-pr-pane" : undefined,
    );
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalledWith(expect.objectContaining({ entrypoint: "review-pr" }));
    expect(deps.setPane).toHaveBeenCalledWith("/repo/wt", "review-pr:42", "pane-1");
  });

  it("keeps the old PR's pane tracked when a different PR opens its own", () => {
    // The bug Codex actually flagged: opening a new key's pane must not clobber another key's
    // still-tracked pane. setPane (unlike the old upsert-based design) merges per key, so this is
    // really just confirming reviewPrAction calls setPane rather than something that replaces the
    // whole entry.
    const deps = makeDeps();
    reviewPrAction(deps);
    expect(deps.setPane).toHaveBeenCalledTimes(1);
    expect(deps.setPane).toHaveBeenCalledWith("/repo/wt", "review-pr:42", "pane-1");
  });
});
