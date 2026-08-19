import { describe, expect, it, vi } from "vitest";
import type { HerdrContext } from "../src/context.js";
import { refreshAction, type RefreshDeps } from "../src/refresh.js";

function makeDeps(overrides: Partial<RefreshDeps> = {}): RefreshDeps & {
  notify: ReturnType<typeof vi.fn>;
  sendKeys: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  indexGet: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const sendKeys = vi.fn().mockReturnValue(true);
  const refresh = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  const indexGet = vi.fn().mockReturnValue({ panes: { review: "review-pane" } });

  const ctx: HerdrContext = { worktree: "/repo/wt" };

  const deps: RefreshDeps = {
    ctx,
    herdr: { notify, sendKeys },
    wiff: { refresh },
    reviewIndex: { get: indexGet },
    ...overrides,
  };

  return { ...deps, notify, sendKeys, refresh, indexGet };
}

describe("refreshAction", () => {
  it("notifies and fails when no worktree can be determined", () => {
    const deps = makeDeps({ ctx: {} });
    expect(refreshAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not determine"));
  });

  it("fails and notifies when wiff refresh fails", () => {
    const deps = makeDeps();
    deps.refresh.mockReturnValue({ status: 1, stdout: "", stderr: "" });
    const status = refreshAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not refresh the session"));
    expect(deps.sendKeys).not.toHaveBeenCalled();
  });

  it("sends ctrl+r to the tracked review pane after a successful refresh", () => {
    const deps = makeDeps();
    const status = refreshAction(deps);
    expect(status).toBe(0);
    expect(deps.sendKeys).toHaveBeenCalledWith("review-pane", "ctrl+r");
  });

  it("succeeds without sending keys when no review pane is tracked", () => {
    const deps = makeDeps({ reviewIndex: { get: vi.fn().mockReturnValue(undefined) } });
    const status = refreshAction(deps);
    expect(status).toBe(0);
    expect(deps.sendKeys).not.toHaveBeenCalled();
  });
});
