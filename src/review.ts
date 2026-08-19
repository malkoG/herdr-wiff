import type { PluginConfig } from "./config.js";
import type { HerdrContext } from "./context.js";
import type { HerdrAdapter } from "./herdr.js";
import { openOrReuseReviewPane } from "./pane-open.js";
import type { ReviewIndex } from "./review-index.js";
import type { WiffCli } from "./wiff.js";

export interface ReviewDeps {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "openPane">;
  wiff: Pick<WiffCli, "newIfNeeded">;
  reviewIndex: Pick<ReviewIndex, "getPane" | "setPane" | "upsert">;
}

/**
 * Opens (or reuses) a wiff review pane for the focused pane's worktree.
 *
 * `wiff new --no-tui --if-needed` is idempotent, so re-running this action is always safe: with
 * `reuse_pane` on, a worktree that already has a tracked pane just gets its session refreshed on
 * disk (the open TUI picks it up on the next `ctrl-r`, sent by `send-review`/`reload`) instead of
 * opening a second pane.
 */
export function reviewAction(deps: ReviewDeps): number {
  const { cfg, ctx, herdr, wiff, reviewIndex } = deps;

  const worktree = ctx.worktree ?? ctx.cwd;
  if (!worktree) {
    herdr.notify("wiff: could not determine the worktree for the focused pane.");
    console.error("wiff: could not resolve worktree from ctx.worktree or ctx.cwd", ctx);
    return 1;
  }

  const result = wiff.newIfNeeded({
    cwd: worktree,
    fromBase: cfg.review.default_target === "branch",
  });
  if (result.status !== 0) {
    herdr.notify("wiff: no changes to review.");
    return 0;
  }

  return openOrReuseReviewPane({ cfg, ctx, herdr, reviewIndex }, worktree);
}
