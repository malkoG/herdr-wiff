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

/**
 * Publishes the review's comments and replies back to the PR.
 *
 * Verified live: `wiff forge push` only publishes comments matching the authorship of the call —
 * plain `push` publishes the human's, `push --agent` publishes the agent's, and neither includes
 * the other (confirmed against a real PR: an agent's reply stayed local until pushed again with
 * `--agent`). Since a review can have both kinds pending, this pushes both.
 */
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
  const pr = prNumber === null ? undefined : String(prNumber);

  const human = wiff.forgePush({ cwd: worktree, pr, token: tokenResult.token });
  const agent = wiff.forgePush({ cwd: worktree, pr, agent: true, token: tokenResult.token });

  const failures = [
    human.status !== 0 ? `human comments: ${maskSecret(human.stderr, tokenResult.token)}` : null,
    agent.status !== 0 ? `agent comments: ${maskSecret(agent.stderr, tokenResult.token)}` : null,
  ].filter((message): message is string => message !== null);

  if (failures.length > 0) {
    herdr.notify(`wiff: could not push to the PR (${failures.join("; ")}).`);
    return 1;
  }

  herdr.notify("wiff: synced comments to the pull request.");
  return 0;
}
