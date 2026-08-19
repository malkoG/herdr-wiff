import { describe, expect, it, vi } from "vitest";
import { reloadAction, type ReloadDeps } from "../src/reload.js";

function makeDeps(overrides: Partial<ReloadDeps> = {}): ReloadDeps & {
  notify: ReturnType<typeof vi.fn>;
  sendKeys: ReturnType<typeof vi.fn>;
  indexGet: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const sendKeys = vi.fn().mockReturnValue(true);
  const indexGet = vi.fn().mockReturnValue({ paneId: "review-pane" });

  const deps: ReloadDeps = {
    ctx: { worktree: "/repo/wt" },
    herdr: { notify, sendKeys },
    reviewIndex: { get: indexGet },
    ...overrides,
  };

  return { ...deps, notify, sendKeys, indexGet };
}

describe("reloadAction", () => {
  it("notifies and fails when no worktree can be determined", () => {
    const deps = makeDeps({ ctx: {} });
    expect(reloadAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not determine"));
  });

  it("sends ctrl+r to the tracked review pane", () => {
    const deps = makeDeps();
    expect(reloadAction(deps)).toBe(0);
    expect(deps.sendKeys).toHaveBeenCalledWith("review-pane", "ctrl+r");
  });

  it("notifies without failing when no review pane is tracked", () => {
    const deps = makeDeps({ reviewIndex: { get: vi.fn().mockReturnValue(undefined) } });
    expect(reloadAction(deps)).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("no review pane"));
    expect(deps.sendKeys).not.toHaveBeenCalled();
  });

  it("fails when herdr cannot send the keys", () => {
    const deps = makeDeps();
    deps.sendKeys.mockReturnValue(false);
    expect(reloadAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not refresh"));
  });
});
