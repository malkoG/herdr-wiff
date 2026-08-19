#!/usr/bin/env node
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { loadConfig } from "../config.js";
import { readContext } from "../context.js";
import { HerdrAdapter } from "../herdr.js";
import { getForgeToken } from "../token.js";
import { withTokenFile } from "../wiff.js";
import { isMainModule } from "./main-guard.js";

export type SpawnFn = (
  bin: string,
  args: string[],
  opts: { stdio: "inherit"; cwd: string },
) => Pick<SpawnSyncReturns<Buffer>, "status">;

/**
 * Runs inside the pane herdr opens for a human. Spawns `wiff resume` (plain review) or
 * `wiff forge pull` (PR review) directly, with real stdio — bypassing `WiffCli`, which
 * deliberately has no method that can invoke either: both need a real tty (`forge pull` fails
 * with "Device not configured" without one), and this is the one place in the plugin where a
 * human is actually attached to the terminal.
 */
export function runReviewPane(
  env: NodeJS.ProcessEnv,
  cwd: string,
  mode: string = "review",
  spawn: SpawnFn = spawnSync,
  notify: (message: string) => void = (m) =>
    new HerdrAdapter(env.HERDR_BIN_PATH ?? "herdr").notify(m),
): number {
  const ctx = readContext(env);
  const worktree = ctx.worktree ?? cwd;
  const bin = env.WIFF_BIN_PATH ?? "wiff";

  if (mode === "review-pr") {
    const pr = env.WIFF_FORGE_PR;
    if (!pr) {
      notify("wiff: no pull request number was passed to the review pane.");
      return 1;
    }

    const cfg = loadConfig(env.HERDR_PLUGIN_CONFIG_DIR ?? ".", (m) => console.error(m));
    const tokenResult = getForgeToken(cfg.forge.token_command);
    if (!tokenResult.ok) {
      notify(tokenResult.message);
      return 1;
    }

    const result = withTokenFile(tokenResult.token, (tokenFile) =>
      spawn(bin, ["forge", "--forge-token-file", tokenFile, "pull", pr], {
        stdio: "inherit",
        cwd: worktree,
      }),
    );
    if (result.status !== 0) {
      notify(
        `wiff: forge pull exited ${result.status ?? "abnormally"} for PR #${pr} in ${worktree}.`,
      );
    }
    return result.status ?? 1;
  }

  const result = spawn(bin, ["resume"], { stdio: "inherit", cwd: worktree });
  if (result.status !== 0) {
    notify(`wiff: resume exited ${result.status ?? "abnormally"} for ${worktree}.`);
  }
  return result.status ?? 1;
}

if (isMainModule(import.meta.url)) {
  process.exit(runReviewPane(process.env, process.cwd(), process.argv[2]));
}
