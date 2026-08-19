import { describe, expect, it, vi } from "vitest";
import { reloadAction, type ReloadDeps } from "../src/reload.js";

function makeDeps(overrides: Partial<ReloadDeps> = {}): ReloadDeps & {
  notify: ReturnType<typeof vi.fn>;
  sendKeys: ReturnType<typeof vi.fn>;
  indexGet: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const sendKeys = vi.fn().mockReturnValue(true);
  const indexGet = vi.fn().mockReturnValue({ panes: { review: "review-pane" } });

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

  it("sends ctrl+r to every tracked pane when more than one is open", () => {
    const deps = makeDeps({
      reviewIndex: {
        get: vi.fn().mockReturnValue({ panes: { review: "review-pane", "review-pr:1": "pr-pane" } }),
      },
    });
    expect(reloadAction(deps)).toBe(0);
    expect(deps.sendKeys).toHaveBeenCalledWith("review-pane", "ctrl+r");
    expect(deps.sendKeys).toHaveBeenCalledWith("pr-pane", "ctrl+r");
  });

  it("notifies without failing when no review pane is tracked", () => {
    const deps = makeDeps({ reviewIndex: { get: vi.fn().mockReturnValue(undefined) } });
    expect(reloadAction(deps)).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("no review pane"));
    expect(deps.sendKeys).not.toHaveBeenCalled();
  });

  it("notifies without failing when the entry has an empty panes map", () => {
    const deps = makeDeps({ reviewIndex: { get: vi.fn().mockReturnValue({ panes: {} }) } });
    expect(reloadAction(deps)).toBe(0);
    expect(deps.sendKeys).not.toHaveBeenCalled();
  });

  it("fails and reports which panes could not be refreshed", () => {
    const deps = makeDeps({
      reviewIndex: {
        get: vi.fn().mockReturnValue({ panes: { review: "review-pane", "review-pr:1": "pr-pane" } }),
      },
    });
    deps.sendKeys.mockImplementation((paneId: string) => paneId !== "pr-pane");
    const status = reloadAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("pr-pane"));
  });
});
