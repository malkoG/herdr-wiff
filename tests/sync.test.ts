import { describe, expect, it, vi } from "vitest";
import { DEFAULTS, type PluginConfig } from "../src/config.js";
import type { HerdrContext } from "../src/context.js";
import { syncAction, type SyncDeps } from "../src/sync.js";
import type { TokenResult } from "../src/token.js";

function makeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps & {
  notify: ReturnType<typeof vi.fn>;
  forgePush: ReturnType<typeof vi.fn>;
  currentPrNumber: ReturnType<typeof vi.fn>;
  getToken: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const forgePush = vi.fn().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  const currentPrNumber = vi.fn().mockReturnValue(42);
  const getToken = vi.fn().mockReturnValue({ ok: true, token: "ghp_secret" } satisfies TokenResult);

  const cfg: PluginConfig = structuredClone(DEFAULTS);
  const ctx: HerdrContext = { worktree: "/repo/wt" };

  const deps: SyncDeps = {
    cfg,
    ctx,
    herdr: { notify },
    wiff: { forgePush },
    gh: { currentPrNumber },
    getToken,
    ...overrides,
  };

  return { ...deps, notify, forgePush, currentPrNumber, getToken };
}

describe("syncAction", () => {
  it("notifies and fails when no worktree can be determined", () => {
    const deps = makeDeps({ ctx: {} });
    expect(syncAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not determine"));
  });

  it("fails with the token error message when the token command fails", () => {
    const deps = makeDeps();
    deps.getToken.mockReturnValue({ ok: false, message: "wiff: token_command failed" } satisfies TokenResult);
    expect(syncAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith("wiff: token_command failed");
    expect(deps.forgePush).not.toHaveBeenCalled();
  });

  it("resolves the PR number itself and passes it along with the token", () => {
    const deps = makeDeps();
    syncAction(deps);
    expect(deps.forgePush).toHaveBeenCalledWith({ cwd: "/repo/wt", pr: "42", token: "ghp_secret" });
  });

  it("pushes without a pr when gh finds none, without failing", () => {
    const deps = makeDeps();
    deps.currentPrNumber.mockReturnValue(null);
    const status = syncAction(deps);
    expect(status).toBe(0);
    expect(deps.forgePush).toHaveBeenCalledWith({ cwd: "/repo/wt", pr: undefined, token: "ghp_secret" });
  });

  it("masks the token in the failure notification when forgePush fails", () => {
    const deps = makeDeps();
    deps.forgePush.mockReturnValue({ status: 1, stdout: "", stderr: "denied for ghp_secret" });
    syncAction(deps);
    const message = deps.notify.mock.calls.at(-1)?.[0] as string;
    expect(message).not.toContain("ghp_secret");
  });

  it("notifies success on a clean push", () => {
    const deps = makeDeps();
    const status = syncAction(deps);
    expect(status).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("synced"));
  });
});
