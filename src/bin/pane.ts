#!/usr/bin/env node
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readContext } from "../context.js";
import { HerdrAdapter } from "../herdr.js";
import { isMainModule } from "./main-guard.js";

export type SpawnFn = (
  bin: string,
  args: string[],
  opts: { stdio: "inherit"; cwd: string },
) => Pick<SpawnSyncReturns<Buffer>, "status">;

/**
 * Runs inside the pane herdr opens for a human. Spawns `wiff resume` directly, bypassing
 * `WiffCli` (which deliberately has no method that can invoke the TUI) — this is the one place
 * in the plugin where launching it is correct, since a real human is attached to this pane.
 */
export function runReviewPane(
  env: NodeJS.ProcessEnv,
  cwd: string,
  spawn: SpawnFn = spawnSync,
  notify: (message: string) => void = (m) =>
    new HerdrAdapter(env.HERDR_BIN_PATH ?? "herdr").notify(m),
): number {
  const ctx = readContext(env);
  const worktree = ctx.worktree ?? cwd;
  const bin = env.WIFF_BIN_PATH ?? "wiff";

  const result = spawn(bin, ["resume"], { stdio: "inherit", cwd: worktree });
  if (result.status !== 0) {
    notify(`wiff: resume exited ${result.status ?? "abnormally"} for ${worktree}.`);
  }
  return result.status ?? 1;
}

if (isMainModule(import.meta.url)) {
  process.exit(runReviewPane(process.env, process.cwd()));
}
