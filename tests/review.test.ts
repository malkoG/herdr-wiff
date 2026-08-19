import { describe, expect, it, vi } from "vitest";
import { DEFAULTS, type PluginConfig } from "../src/config.js";
import type { HerdrContext } from "../src/context.js";
import { reviewAction, type ReviewDeps } from "../src/review.js";

function makeDeps(overrides: Partial<ReviewDeps> = {}): ReviewDeps & {
  notify: ReturnType<typeof vi.fn>;
  openPane: ReturnType<typeof vi.fn>;
  newIfNeeded: ReturnType<typeof vi.fn>;
  indexGet: ReturnType<typeof vi.fn>;
  indexUpsert: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const openPane = vi.fn().mockReturnValue("pane-1");
  const newIfNeeded = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  const indexGet = vi.fn().mockReturnValue(undefined);
  const indexUpsert = vi.fn();

  const cfg: PluginConfig = structuredClone(DEFAULTS);
  const ctx: HerdrContext = { worktree: "/repo/wt" };

  const deps: ReviewDeps = {
    cfg,
    ctx,
    herdr: { notify, openPane },
    wiff: { newIfNeeded },
    reviewIndex: { get: indexGet, upsert: indexUpsert },
    ...overrides,
  };

  return { ...deps, notify, openPane, newIfNeeded, indexGet, indexUpsert };
}

describe("reviewAction", () => {
  it("notifies and fails when no worktree can be determined", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps({ ctx: {} });
    const status = reviewAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not determine"));
    expect(deps.openPane).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("could not resolve worktree"), {});
    errorSpy.mockRestore();
  });

  it("notifies and exits 0 when wiff reports no changes", () => {
    const deps = makeDeps();
    deps.newIfNeeded.mockReturnValue({ status: 1, stdout: "", stderr: "" });
    const status = reviewAction(deps);
    expect(status).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("no changes"));
    expect(deps.openPane).not.toHaveBeenCalled();
  });

  it("runs --from-base when default_target is branch", () => {
    const deps = makeDeps();
    deps.cfg.review.default_target = "branch";
    reviewAction(deps);
    expect(deps.newIfNeeded).toHaveBeenCalledWith({ cwd: "/repo/wt", fromBase: true });
  });

  it("runs without --from-base when default_target is working", () => {
    const deps = makeDeps();
    deps.cfg.review.default_target = "working";
    reviewAction(deps);
    expect(deps.newIfNeeded).toHaveBeenCalledWith({ cwd: "/repo/wt", fromBase: false });
  });

  it("opens a pane and tracks it on success", () => {
    const deps = makeDeps();
    const status = reviewAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalledWith(
      expect.objectContaining({ entrypoint: "review", cwd: "/repo/wt", placement: "split" }),
    );
    expect(deps.indexUpsert).toHaveBeenCalledWith("/repo/wt", {
      paneId: "pane-1",
      paneEntrypoint: "review",
    });
  });

  it("fails and notifies when herdr returns no pane id", () => {
    const deps = makeDeps();
    deps.openPane.mockReturnValue(null);
    const status = reviewAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not open"));
    expect(deps.indexUpsert).not.toHaveBeenCalledWith("/repo/wt", { paneId: expect.anything() });
  });

  it("reuses the tracked pane and does not open a new one", () => {
    const deps = makeDeps();
    deps.indexGet.mockReturnValue({ paneId: "pane-existing", paneEntrypoint: "review" });
    const status = reviewAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).not.toHaveBeenCalled();
  });

  it("opens a new pane when the tracked pane is running a different entrypoint", () => {
    const deps = makeDeps();
    deps.indexGet.mockReturnValue({ paneId: "pr-pane", paneEntrypoint: "review-pr" });
    const status = reviewAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalled();
  });

  it("opens a new pane even with a tracked entry when reuse_pane is off", () => {
    const deps = makeDeps();
    deps.cfg.review.reuse_pane = false;
    deps.indexGet.mockReturnValue({ paneId: "pane-existing" });
    const status = reviewAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalled();
  });

  it("falls back to ctx.cwd when worktree is unset", () => {
    const deps = makeDeps({ ctx: { cwd: "/repo/cwd" } });
    reviewAction(deps);
    expect(deps.newIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo/cwd" }),
    );
  });

  it("records the agent pane when invoked from within an agent's own pane", () => {
    const deps = makeDeps({ ctx: { worktree: "/repo/wt", paneId: "agent-pane", agentName: "claude" } });
    reviewAction(deps);
    expect(deps.indexUpsert).toHaveBeenCalledWith("/repo/wt", {
      agentPaneId: "agent-pane",
      agentName: "claude",
    });
  });

  it("does not record an agent pane when the invoking pane has no agent", () => {
    const deps = makeDeps({ ctx: { worktree: "/repo/wt", paneId: "human-pane" } });
    reviewAction(deps);
    expect(deps.indexUpsert).not.toHaveBeenCalledWith(
      "/repo/wt",
      expect.objectContaining({ agentPaneId: expect.anything() }),
    );
  });
});
