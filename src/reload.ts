import type { HerdrContext } from "./context.js";
import type { HerdrAdapter } from "./herdr.js";
import type { ReviewIndex } from "./review-index.js";

export interface ReloadDeps {
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "sendKeys">;
  reviewIndex: Pick<ReviewIndex, "get">;
}

/**
 * Sends `ctrl-r` to every tracked review pane for this worktree, so each picks up changes wiff
 * wrote to disk. More than one can be open at once (e.g. a plain `review` pane alongside a
 * `review-pr` one for a specific PR) since each reuse key gets its own pane.
 */
export function reloadAction(deps: ReloadDeps): number {
  const { ctx, herdr, reviewIndex } = deps;

  const worktree = ctx.worktree ?? ctx.cwd;
  if (!worktree) {
    herdr.notify("wiff: could not determine the worktree for the focused pane.");
    return 1;
  }

  const panes = Object.values(reviewIndex.get(worktree)?.panes ?? {});
  if (panes.length === 0) {
    herdr.notify("wiff: no review pane is open for this worktree.");
    return 0;
  }

  const failed = panes.filter((paneId) => !herdr.sendKeys(paneId, "ctrl+r"));
  if (failed.length > 0) {
    herdr.notify(`wiff: could not refresh review pane(s): ${failed.join(", ")}.`);
    return 1;
  }

  return 0;
}
