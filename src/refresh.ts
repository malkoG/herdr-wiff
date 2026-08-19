import type { HerdrContext } from "./context.js";
import type { HerdrAdapter } from "./herdr.js";
import { reloadAction } from "./reload.js";
import type { ReviewIndex } from "./review-index.js";
import type { WiffCli } from "./wiff.js";

export interface RefreshDeps {
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "sendKeys">;
  wiff: Pick<WiffCli, "refresh">;
  reviewIndex: Pick<ReviewIndex, "get">;
}

/** Captures a new diff version into the session, rebases comments, then refreshes the pane. */
export function refreshAction(deps: RefreshDeps): number {
  const { ctx, herdr, wiff, reviewIndex } = deps;

  const worktree = ctx.worktree ?? ctx.cwd;
  if (!worktree) {
    herdr.notify("wiff: could not determine the worktree for the focused pane.");
    return 1;
  }

  const result = wiff.refresh({ cwd: worktree });
  if (result.status !== 0) {
    herdr.notify(`wiff: could not refresh the session for ${worktree}.`);
    return 1;
  }

  return reloadAction({ ctx, herdr, reviewIndex });
}
