import type { PluginConfig } from "./config.js";
import type { HerdrContext } from "./context.js";
import type { GhAdapter } from "./gh.js";
import type { HerdrAdapter } from "./herdr.js";
import { maskSecret } from "./mask.js";
import { getForgeToken } from "./token.js";
import type { WiffCli } from "./wiff.js";

export interface SyncDeps {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify">;
  wiff: Pick<WiffCli, "forgePush">;
  gh: Pick<GhAdapter, "currentPrNumber">;
  getToken?: typeof getForgeToken;
}

/** Publishes the review's comments and replies back to the PR. */
export function syncAction(deps: SyncDeps): number {
  const { cfg, ctx, herdr, wiff, gh } = deps;
  const getToken = deps.getToken ?? getForgeToken;

  const worktree = ctx.worktree ?? ctx.cwd;
  if (!worktree) {
    herdr.notify("wiff: could not determine the worktree for the focused pane.");
    return 1;
  }

  const tokenResult = getToken(cfg.forge.token_command);
  if (!tokenResult.ok) {
    herdr.notify(tokenResult.message);
    return 1;
  }

  const prNumber = gh.currentPrNumber(worktree);
  const push = wiff.forgePush({
    cwd: worktree,
    pr: prNumber === null ? undefined : String(prNumber),
    token: tokenResult.token,
  });
  if (push.status !== 0) {
    herdr.notify(`wiff: could not push to the PR. ${maskSecret(push.stderr, tokenResult.token)}`);
    return 1;
  }

  herdr.notify("wiff: synced comments to the pull request.");
  return 0;
}
