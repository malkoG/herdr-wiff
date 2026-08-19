import { describe, expect, it, vi } from "vitest";
import { DEFAULTS, type PluginConfig } from "../src/config.js";
import type { HerdrContext } from "../src/context.js";
import { reviewPrAction, type ReviewPrDeps } from "../src/review-pr.js";
import type { TokenResult } from "../src/token.js";

function makeDeps(overrides: Partial<ReviewPrDeps> = {}): ReviewPrDeps & {
  notify: ReturnType<typeof vi.fn>;
  openPane: ReturnType<typeof vi.fn>;
  newIfNeeded: ReturnType<typeof vi.fn>;
  forgePull: ReturnType<typeof vi.fn>;
  currentPrNumber: ReturnType<typeof vi.fn>;
  indexGet: ReturnType<typeof vi.fn>;
  indexUpsert: ReturnType<typeof vi.fn>;
  getToken: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const openPane = vi.fn().mockReturnValue("pane-1");
  const newIfNeeded = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  const forgePull = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  const currentPrNumber = vi.fn().mockReturnValue(42);
  const indexGet = vi.fn().mockReturnValue(undefined);
  const indexUpsert = vi.fn();
  const getToken = vi.fn().mockReturnValue({ ok: true, token: "ghp_secret" } satisfies TokenResult);

  const cfg: PluginConfig = structuredClone(DEFAULTS);
  const ctx: HerdrContext = { worktree: "/repo/wt" };

  const deps: ReviewPrDeps = {
    cfg,
    ctx,
    herdr: { notify, openPane },
    wiff: { newIfNeeded, forgePull },
    gh: { currentPrNumber },
    reviewIndex: { get: indexGet, upsert: indexUpsert },
    getToken,
    ...overrides,
  };

  return { ...deps, notify, openPane, newIfNeeded, forgePull, currentPrNumber, indexGet, indexUpsert, getToken };
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
    expect(deps.forgePull).not.toHaveBeenCalled();
    expect(deps.newIfNeeded).toHaveBeenCalled();
    expect(deps.openPane).toHaveBeenCalled();
  });

  it("fails with the token error message when the token command fails", () => {
    const deps = makeDeps();
    deps.getToken.mockReturnValue({ ok: false, message: "wiff: token_command failed" } satisfies TokenResult);
    const status = reviewPrAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith("wiff: token_command failed");
    expect(deps.forgePull).not.toHaveBeenCalled();
  });

  it("pulls the resolved PR number and passes the fetched token", () => {
    const deps = makeDeps();
    reviewPrAction(deps);
    expect(deps.forgePull).toHaveBeenCalledWith({ cwd: "/repo/wt", pr: "42", token: "ghp_secret" });
  });

  it("masks the token in the failure notification when forgePull fails", () => {
    const deps = makeDeps();
    deps.forgePull.mockReturnValue({ status: 1, stdout: "", stderr: "auth failed for ghp_secret" });
    const status = reviewPrAction(deps);
    expect(status).toBe(1);
    const message = deps.notify.mock.calls.at(-1)?.[0] as string;
    expect(message).not.toContain("ghp_secret");
    expect(message).toContain("***");
  });

  it("opens the review pane after a successful pull", () => {
    const deps = makeDeps();
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).toHaveBeenCalledWith(
      expect.objectContaining({ entrypoint: "review", cwd: "/repo/wt" }),
    );
    expect(deps.indexUpsert).toHaveBeenCalledWith("/repo/wt", { paneId: "pane-1" });
  });

  it("reuses the tracked pane instead of opening a new one", () => {
    const deps = makeDeps();
    deps.indexGet.mockReturnValue({ paneId: "existing" });
    const status = reviewPrAction(deps);
    expect(status).toBe(0);
    expect(deps.openPane).not.toHaveBeenCalled();
  });
});
