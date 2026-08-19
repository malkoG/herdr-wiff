import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJsonObject } from "./json.js";
import type { WiffRender } from "./wiff-schema.js";

export interface WiffResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type SpawnFn = (
  bin: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv },
) => WiffResult;

const defaultSpawn: SpawnFn = (bin, args, opts) => {
  const r = spawnSync(bin, args, { cwd: opts.cwd, env: opts.env, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

export interface NewIfNeededOptions {
  cwd: string;
  /**
   * `true` reviews the whole branch against its fork point (`--from-base`); `false` reviews the
   * working copy. wiff 0.1.0's `--from-base` unconditionally fails without a real tty on stdin
   * (which a spawned action process never has), so callers should default this to `false`.
   */
  fromBase: boolean;
}

/**
 * Thin wrapper around the wiff CLI, scoped to non-interactive subcommands only.
 *
 * `wiff resume`, bare `wiff new`, and `wiff forge pull` (verified: it has no `--no-tui` — its own
 * `--help` says "fetch a pull request into a session and open it", and it fails with "Device not
 * configured" outside a real tty) all open a full-screen TUI meant for a human; run from a
 * non-interactive shell they hang or fail outright. This class has no method that can invoke any
 * of them — every public method here is either always non-interactive by nature or always passes
 * `--no-tui`. (`forge push`, unlike `pull`, is confirmed non-interactive: verified live against a
 * real PR with no tty attached.) The pane process that hosts the human's TUI spawns `resume`/
 * `forge pull` directly, with real stdio, bypassing this wrapper entirely.
 */
export class WiffCli {
  constructor(
    private readonly bin: string = "wiff",
    private readonly spawn: SpawnFn = defaultSpawn,
    private readonly env?: NodeJS.ProcessEnv,
  ) {}

  /**
   * Idempotent: creates the session if none exists, refreshes it in place if the working copy
   * moved, or no-ops if it's already current. Exits non-zero only when there is neither an
   * existing session nor any changes to review.
   */
  newIfNeeded(opts: NewIfNeededOptions): WiffResult {
    const args = ["new", "--no-tui", "--if-needed"];
    if (opts.fromBase) args.push("--from-base");
    return this.spawn(this.bin, args, { cwd: opts.cwd, env: this.env });
  }

  /** Renders the active session's full state. Returns `null` on a non-zero exit or unparseable JSON. */
  render(opts: { cwd: string }): WiffRender | null {
    const result = this.spawn(this.bin, ["render", "--format", "json"], {
      cwd: opts.cwd,
      env: this.env,
    });
    if (result.status !== 0) return null;
    const parsed = parseJsonObject(result.stdout);
    return parsed as WiffRender | null;
  }

  /** Captures a new diff version into the session and rebases comments onto it. */
  refresh(opts: { cwd: string }): WiffResult {
    return this.spawn(this.bin, ["refresh"], { cwd: opts.cwd, env: this.env });
  }

  /**
   * Publishes the review's comments back to the PR. The token travels via
   * `wiff forge --forge-token-file <path>` (confirmed in `wiff forge --help`), not an env var or a
   * bare CLI arg: a private, mode-0600 temp file is written just for this call and deleted
   * immediately after, so the token value never appears in `ps` output and never lingers in
   * `this.env` for a later, non-forge call.
   *
   * `agent` matters and is easy to miss: verified live that plain `forge push` only publishes
   * *human*-authored comments — an agent's own replies (added via `wiff comment add --agent`)
   * silently do not get published without `--agent` on the push itself (confirmed by `--help`:
   * "publish that agent's comments **instead of** the human reviewer's" — the two are mutually
   * exclusive per call). `syncAction` calls this twice, once with each, to publish both.
   */
  forgePush(opts: { cwd: string; pr?: string; session?: string; agent?: boolean; token: string }): WiffResult {
    return withTokenFile(opts.token, (tokenFile) => {
      const args = ["forge", "--forge-token-file", tokenFile, "push"];
      if (opts.agent) args.push("--agent");
      if (opts.pr) args.push(opts.pr);
      if (opts.session) args.push("--session", opts.session);
      return this.spawn(this.bin, args, { cwd: opts.cwd, env: this.env });
    });
  }
}

/**
 * Writes `token` to a private (mode 0600), unguessable temp file for the duration of `fn`.
 * Exported for `bin/pane.ts`, which needs the same token-file scoping for the interactive
 * `forge pull` it runs with real stdio (see the class doc comment for why that can't live here).
 */
export function withTokenFile<T>(token: string, fn: (path: string) => T): T {
  const path = join(tmpdir(), `wiff-forge-token-${randomUUID()}`);
  writeFileSync(path, token, { mode: 0o600 });
  try {
    return fn(path);
  } finally {
    try {
      unlinkSync(path);
    } catch {
      // Best-effort cleanup; the file is private and short-lived either way.
    }
  }
}
