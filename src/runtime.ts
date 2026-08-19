import { loadConfig, type PluginConfig } from "./config.js";
import { readContext, type HerdrContext } from "./context.js";
import { GhAdapter } from "./gh.js";
import { HerdrAdapter } from "./herdr.js";
import { refreshAction } from "./refresh.js";
import { reloadAction } from "./reload.js";
import { reviewAction } from "./review.js";
import { ReviewIndex } from "./review-index.js";
import { reviewPrAction } from "./review-pr.js";
import { sendReviewAction } from "./send-review.js";
import { syncAction } from "./sync.js";
import { WiffCli } from "./wiff.js";

export interface Runtime {
  cfg: PluginConfig;
  ctx: HerdrContext;
  herdr: HerdrAdapter;
  wiff: WiffCli;
  gh: GhAdapter;
  reviewIndex: ReviewIndex;
}

export function buildRuntime(env: NodeJS.ProcessEnv): Runtime {
  const cfg = loadConfig(env.HERDR_PLUGIN_CONFIG_DIR ?? ".", (m) => console.error(m));
  const ctx = readContext(env);
  const stateDir = env.HERDR_PLUGIN_STATE_DIR ?? ".";

  return {
    cfg,
    ctx,
    herdr: new HerdrAdapter(env.HERDR_BIN_PATH ?? "herdr"),
    wiff: new WiffCli(env.WIFF_BIN_PATH ?? "wiff", undefined, env),
    gh: new GhAdapter(env.GH_BIN_PATH ?? "gh"),
    reviewIndex: new ReviewIndex(stateDir),
  };
}

export async function dispatch(actionId: string, rt: Runtime): Promise<number> {
  switch (actionId) {
    case "wiff-review":
      return reviewAction(rt);
    case "wiff-review-pr":
      return reviewPrAction(rt);
    case "wiff-send-review":
      return sendReviewAction(rt);
    case "wiff-sync":
      return syncAction(rt);
    case "wiff-reload":
      return reloadAction(rt);
    case "wiff-refresh":
      return refreshAction(rt);
    default:
      return 2;
  }
}
