import type { PluginConfig } from "./config.js";
import type { HerdrContext } from "./context.js";
import type { GhAdapter } from "./gh.js";
import type { HerdrAdapter } from "./herdr.js";
import { maskSecret } from "./mask.js";
import { openOrReuseReviewPane } from "./pane-open.js";
import { reviewAction } from "./review.js";
import type { ReviewIndex } from "./review-index.js";
import { getForgeToken } from "./token.js";
import type { WiffCli } from "./wiff.js";

export interface ReviewPrDeps {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "openPane">;
  wiff: Pick<WiffCli, "newIfNeeded" | "forgePull">;
  gh: Pick<GhAdapter, "currentPrNumber">;
  reviewIndex: Pick<ReviewIndex, "get" | "upsert">;
  /** Injected for tests; defaults to the real `getForgeToken`. */
  getToken?: typeof getForgeToken;
}

/**
 * Mirrors the current branch's PR into a wiff session and opens (or reuses) the review pane.
 *
 * The PR number is never typed by a human — resolved via `gh pr view --json number`. No PR for
 * this branch isn't an error: falls back to the plain local `review` action.
 */
export function reviewPrAction(deps: ReviewPrDeps): number {
  const { cfg, ctx, herdr, wiff, gh, reviewIndex } = deps;
  const getToken = deps.getToken ?? getForgeToken;

  const worktree = ctx.worktree ?? ctx.cwd;
  if (!worktree) {
    herdr.notify("wiff: could not determine the worktree for the focused pane.");
    return 1;
  }

  const prNumber = gh.currentPrNumber(worktree);
  if (prNumber === null) {
    herdr.notify("wiff: no pull request for this branch; opening a local review instead.");
    return reviewAction({ cfg, ctx, herdr, wiff, reviewIndex });
  }

  const tokenResult = getToken(cfg.forge.token_command);
  if (!tokenResult.ok) {
    herdr.notify(tokenResult.message);
    return 1;
  }

  const pull = wiff.forgePull({ cwd: worktree, pr: String(prNumber), token: tokenResult.token });
  if (pull.status !== 0) {
    herdr.notify(
      `wiff: could not pull PR #${prNumber}. ${maskSecret(pull.stderr, tokenResult.token)}`,
    );
    return 1;
  }

  return openOrReuseReviewPane({ cfg, ctx, herdr, reviewIndex }, worktree);
}
