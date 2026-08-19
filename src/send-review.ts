import type { PluginConfig } from "./config.js";
import type { HerdrContext } from "./context.js";
import { formatReview, selectSendableThreads } from "./courier.js";
import type { HerdrAdapter } from "./herdr.js";
import type { ReviewIndex } from "./review-index.js";
import type { WiffCli } from "./wiff.js";
import { SUPPORTED_SCHEMA_VERSION } from "./wiff-schema.js";

export interface SendReviewDeps {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: Pick<HerdrAdapter, "notify" | "promptAgent" | "sendKeys">;
  wiff: Pick<WiffCli, "render">;
  reviewIndex: Pick<ReviewIndex, "get">;
}

/** Returns the invoking pane only when herdr reports that it runs an agent. */
function agentPaneFromContext(ctx: HerdrContext): string | undefined {
  return ctx.agentName ? ctx.paneId : undefined;
}

/**
 * Delivers unresolved human review comments to the agent that owns this worktree.
 *
 * No sent-tracking store: `resolved == false && deleted == false` is the send filter, so once the
 * agent resolves a comment it naturally drops out of the next send — the state machine in wiff's
 * own session file does the dedup.
 */
export function sendReviewAction(deps: SendReviewDeps): number {
  const { cfg, ctx, herdr, wiff, reviewIndex } = deps;

  const worktree = ctx.worktree ?? ctx.cwd;
  if (!worktree) {
    herdr.notify("wiff: could not determine the worktree for the focused pane.");
    return 1;
  }

  const render = wiff.render({ cwd: worktree });
  if (!render) {
    herdr.notify(`wiff: could not read the review session for ${worktree}.`);
    return 1;
  }
  if (render.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    herdr.notify(
      `wiff: session schema_version ${render.schema_version} differs from the ` +
        `${SUPPORTED_SCHEMA_VERSION} this plugin was built against; continuing anyway.`,
    );
  }

  const threads = selectSendableThreads(render.comments, {
    filterNoise: cfg.roundtrip.filter_noise,
  });
  if (threads.length === 0) {
    herdr.notify("wiff: no new review comments to send.");
    return 0;
  }

  const entry = reviewIndex.get(worktree);
  const target = agentPaneFromContext(ctx) ?? entry?.agentPaneId;
  const label = ctx.agentName ?? entry?.agentName;
  if (!target) {
    herdr.notify(`wiff: no agent is associated with ${worktree}; comments kept.`);
    return 1;
  }

  const text = formatReview(threads, {
    template: cfg.roundtrip.prompt_template,
    worktree,
    agentLabel: label,
  });

  if (!herdr.promptAgent(target, text)) {
    herdr.notify(`wiff: could not prompt agent "${label ?? target}"; comments kept.`);
    return 1;
  }

  if (entry?.paneId) herdr.sendKeys(entry.paneId, "ctrl+r");

  herdr.notify(`wiff: sent ${threads.length} comment thread(s) to ${label ?? target}.`);
  return 0;
}
