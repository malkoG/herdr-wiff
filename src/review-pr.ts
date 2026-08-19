import type { PluginConfig } from "./config.js";
import type { HerdrContext } from "./context.js";
import type { GhAdapter } from "./gh.js";
import type { HerdrAdapter } from "./herdr.js";
import { openOrReuseReviewPane } from "./pane-open.js";
import { reviewAction } from "./review.js";
import type { ReviewIndex } from "./review-index.js";
import type { WiffCli } from "./wiff.js";

export interface ReviewPrDeps {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "openPane">;
  wiff: Pick<WiffCli, "newIfNeeded">;
  gh: Pick<GhAdapter, "currentPrNumber">;
  reviewIndex: Pick<ReviewIndex, "get" | "upsert">;
}

/**
 * Opens (or reuses) the review pane for the current branch's PR.
 *
 * The PR number is never typed by a human — resolved via `gh pr view --json number`. No PR for
 * this branch isn't an error: falls back to the plain local `review` action.
 *
 * Unlike `review`, this does not run `wiff forge pull` itself: verified that it has no `--no-tui`
 * — its own `--help` says "fetch a pull request into a session and open it", and outside a real
 * tty it fails with "Device not configured". So the pull has to happen inside the pane, which has
 * a real tty (same reasoning as `wiff resume`) — the `review-pr` pane entrypoint runs it, reading
 * the PR number back from the `WIFF_FORGE_PR` env var this sets when opening the pane.
 */
export function reviewPrAction(deps: ReviewPrDeps): number {
  const { cfg, ctx, herdr, wiff, gh, reviewIndex } = deps;

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

  return openOrReuseReviewPane({ cfg, ctx, herdr, reviewIndex }, worktree, {
    entrypoint: "review-pr",
    env: { WIFF_FORGE_PR: String(prNumber) },
    // A worktree can switch to a branch tracking a different PR; keying reuse on the PR number
    // (not just the entrypoint) stops that from silently reusing the old PR's pane.
    reuseKey: `review-pr:${prNumber}`,
  });
}
