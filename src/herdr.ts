import { spawnSync } from "node:child_process";
import type { Placement } from "./config.js";
import { asObject, asString, parseJsonObject, type JsonObject } from "./json.js";

export type CliRunner = (args: string[]) => { status: number; stdout: string };

export interface OpenPaneOptions {
  plugin: string;
  entrypoint: string;
  cwd: string;
  placement: Placement;
  targetPane?: string;
  /** Extra env vars for the launched pane process, e.g. a non-secret PR number. */
  env?: Record<string, string>;
}

/** Thin `spawnSync` wrapper over the herdr CLI — per the docs, the CLI is the entire plugin API. */
export class HerdrAdapter {
  constructor(
    private readonly bin: string = "herdr",
    private readonly run: CliRunner = (args) => {
      const r = spawnSync(this.bin, args, { encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout ?? "" };
    },
  ) {}

  private json(args: string[]): JsonObject | null {
    const r = this.run(args);
    if (r.status !== 0) return null;
    return parseJsonObject(r.stdout);
  }

  notify(message: string): void {
    this.run(["notification", "show", message]);
  }

  /** `pane_id` is nested under `result.plugin_pane.pane` in the CLI response. */
  openPane(opts: OpenPaneOptions): string | null {
    const args = [
      "plugin",
      "pane",
      "open",
      "--plugin",
      opts.plugin,
      "--entrypoint",
      opts.entrypoint,
      "--cwd",
      opts.cwd,
      "--placement",
      opts.placement,
    ];
    if (opts.targetPane) args.push("--target-pane", opts.targetPane);
    for (const [key, value] of Object.entries(opts.env ?? {})) {
      args.push("--env", `${key}=${value}`);
    }
    const response = this.json(args);
    const result = asObject(response?.result);
    const pluginPane = asObject(result?.plugin_pane);
    const pane = asObject(pluginPane?.pane);
    return asString(pane?.pane_id) ?? null;
  }

  /** Submits text into an agent pane's input, honoring bracketed paste, and presses Enter. */
  promptAgent(paneId: string, text: string): boolean {
    return this.run(["agent", "prompt", paneId, text]).status === 0;
  }

  /** Sends key presses to a pane, e.g. `sendKeys(paneId, "ctrl+r")` to refresh a TUI. */
  sendKeys(paneId: string, ...keys: string[]): boolean {
    return this.run(["pane", "send-keys", paneId, ...keys]).status === 0;
  }
}
