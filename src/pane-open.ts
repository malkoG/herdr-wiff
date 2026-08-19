import type { PluginConfig } from "./config.js";
import type { HerdrContext } from "./context.js";
import type { HerdrAdapter } from "./herdr.js";
import { PLUGIN_ID } from "./plugin.js";
import type { ReviewIndex } from "./review-index.js";

export interface PaneOpenDeps {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "openPane">;
  reviewIndex: Pick<ReviewIndex, "get" | "upsert">;
}

/** Returns the invoking pane only when herdr reports that it runs an agent. */
export function agentPaneFromContext(ctx: HerdrContext): { agentPaneId?: string; agentName?: string } {
  return ctx.agentName && ctx.paneId ? { agentPaneId: ctx.paneId, agentName: ctx.agentName } : {};
}

/**
 * Opens (or reuses) the wiff review pane for `worktree`, once its session already exists.
 * Shared by `review` and `review:pr` — the only difference between them is how the session got
 * created (`wiff new --if-needed` vs `wiff forge pull`); opening the pane afterward is identical.
 *
 * When invoked from within an agent's own pane, the agent's pane id is recorded against this
 * worktree — `send-review` later reads it back to know who to hand comments to.
 */
export function openOrReuseReviewPane(deps: PaneOpenDeps, worktree: string): number {
  const { cfg, ctx, herdr, reviewIndex } = deps;

  const agentPatch = agentPaneFromContext(ctx);
  if (Object.keys(agentPatch).length > 0) {
    reviewIndex.upsert(worktree, agentPatch);
  }

  if (cfg.review.reuse_pane && reviewIndex.get(worktree)?.paneId) {
    return 0;
  }

  const paneId = herdr.openPane({
    plugin: PLUGIN_ID,
    entrypoint: "review",
    cwd: worktree,
    placement: cfg.review.placement,
  });
  if (!paneId) {
    herdr.notify(`wiff: could not open the review pane for ${worktree}.`);
    return 1;
  }

  reviewIndex.upsert(worktree, { paneId });
  return 0;
}
