import type { PluginConfig } from "./config.js";
import type { HerdrContext } from "./context.js";
import type { HerdrAdapter } from "./herdr.js";
import { PLUGIN_ID } from "./plugin.js";
import type { ReviewIndex } from "./review-index.js";

export interface PaneOpenDeps {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "openPane">;
  reviewIndex: Pick<ReviewIndex, "getPane" | "setPane" | "upsert">;
}

/** Returns the invoking pane only when herdr reports that it runs an agent. */
export function agentPaneFromContext(ctx: HerdrContext): { agentPaneId?: string; agentName?: string } {
  return ctx.agentName && ctx.paneId ? { agentPaneId: ctx.paneId, agentName: ctx.agentName } : {};
}

export interface OpenOrReuseOptions {
  /** Defaults to `"review"` (runs `wiff resume`); `review:pr` uses `"review-pr"` (runs `wiff forge pull` — it needs its own real tty, same as `resume`, so the action process can't run it itself). */
  entrypoint?: string;
  /** Extra env vars for the launched pane, e.g. the PR number `review-pr` reads back. */
  env?: Record<string, string>;
  /**
   * Overrides `entrypoint` as the reuse-matching key. `review:pr` sets this to `review-pr:<PR
   * number>` so that switching this worktree to a branch tracking a *different* PR opens a fresh
   * pane instead of reusing one still bound to the old PR. Defaults to `entrypoint`.
   */
  reuseKey?: string;
}

/**
 * Opens (or reuses) the wiff review pane for `worktree`.
 *
 * Reuse only applies when the tracked pane's key matches exactly — `review` and `review:pr` show
 * genuinely different content and wiff's TUI can't be re-pointed once spawned, so a `review:pr`
 * call must never silently reuse a plain working-copy pane (or one bound to a different PR). A
 * non-matching key always opens its own pane, alongside any existing one.
 *
 * Reusing an already-tracked pane skips opening a new window, but does **not** re-run whatever
 * the entrypoint does (`wiff resume` just keeps showing what it already had; `review-pr`'s
 * `forge pull` does not re-sync) — closing and reopening is required for a fresh sync while reusing.
 *
 * When invoked from within an agent's own pane, the agent's pane id is recorded against this
 * worktree — `send-review` later reads it back to know who to hand comments to.
 */
export function openOrReuseReviewPane(
  deps: PaneOpenDeps,
  worktree: string,
  opts: OpenOrReuseOptions = {},
): number {
  const { cfg, ctx, herdr, reviewIndex } = deps;
  const entrypoint = opts.entrypoint ?? "review";
  const paneKey = opts.reuseKey ?? entrypoint;

  const agentPatch = agentPaneFromContext(ctx);
  if (Object.keys(agentPatch).length > 0) {
    reviewIndex.upsert(worktree, agentPatch);
  }

  if (cfg.review.reuse_pane && reviewIndex.getPane(worktree, paneKey)) {
    return 0;
  }

  const paneId = herdr.openPane({
    plugin: PLUGIN_ID,
    entrypoint,
    cwd: worktree,
    placement: cfg.review.placement,
    env: opts.env,
  });
  if (!paneId) {
    herdr.notify(`wiff: could not open the review pane for ${worktree}.`);
    return 1;
  }

  reviewIndex.setPane(worktree, paneKey, paneId);
  return 0;
}
