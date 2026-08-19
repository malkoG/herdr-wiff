import { describe, expect, it, vi } from "vitest";
import { DEFAULTS, type PluginConfig } from "../src/config.js";
import type { HerdrContext } from "../src/context.js";
import { reviewPrAction, type ReviewPrDeps } from "../src/review-pr.js";

function makeDeps(overrides: Partial<ReviewPrDeps> = {}): ReviewPrDeps & {
  notify: ReturnType<typeof vi.fn>;
  openPane: ReturnType<typeof vi.fn>;
  newIfNeeded: ReturnType<typeof vi.fn>;
  currentPrNumber: ReturnType<typeof vi.fn>;
  indexGet: ReturnType<typeof vi.fn>;
  indexUpsert: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const openPane = vi.fn().mockReturnValue("pane-1");
  const newIfNeeded = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  const currentPrNumber = vi.fn().mockReturnValue(42);
  const indexGet = vi.fn().mockReturnValue(undefined);
  const indexUpsert = vi.fn();

  const cfg: PluginConfig = structuredClone(DEFAULTS);
  const ctx: HerdrContext = { worktree: "/repo/wt" };

  const deps: ReviewPrDeps = {
    cfg,
    ctx,
    herdr: { notify, openPane },
    wiff: { newIfNeeded },
    gh: { currentPrNumber },
    reviewIndex: { get: indexGet, upsert: indexUpsert },
    ...overrides,
  };

  return { ...deps, notify, openPane, newIfNeeded, currentPrNumber, indexGet, indexUpsert };
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
    expect(deps.indexUpsert).toHaveBeenCalledWith("/repo/wt", {
      paneId: "pane-1",
      paneEntrypoint: "review-pr",
    });
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
    deps.indexGet.mockReturnValue({ paneId: "existing", paneEntrypoint: "review-pr" });
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).not.toHaveBeenCalled();
  });

  it("does not reuse a plain review pane never bound to a PR", () => {
    const deps = makeDeps();
    deps.indexGet.mockReturnValue({ paneId: "plain-review-pane", paneEntrypoint: "review" });
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalledWith(expect.objectContaining({ entrypoint: "review-pr" }));
  });
});
