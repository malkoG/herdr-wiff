import type { HerdrContext } from "./context.js";
import type { HerdrAdapter } from "./herdr.js";
import type { ReviewIndex } from "./review-index.js";

export interface ReloadDeps {
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "sendKeys">;
  reviewIndex: Pick<ReviewIndex, "get">;
}

/** Sends `ctrl-r` to the tracked review pane so it picks up changes wiff wrote to disk. */
export function reloadAction(deps: ReloadDeps): number {
  const { ctx, herdr, reviewIndex } = deps;

  const worktree = ctx.worktree ?? ctx.cwd;
  if (!worktree) {
    herdr.notify("wiff: could not determine the worktree for the focused pane.");
    return 1;
  }

  const paneId = reviewIndex.get(worktree)?.paneId;
  if (!paneId) {
    herdr.notify("wiff: no review pane is open for this worktree.");
    return 0;
  }

  if (!herdr.sendKeys(paneId, "ctrl+r")) {
    herdr.notify(`wiff: could not refresh the review pane ${paneId}.`);
    return 1;
  }

  return 0;
}
