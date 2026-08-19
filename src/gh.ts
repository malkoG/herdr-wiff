import { spawnSync } from "node:child_process";

export type GhRunner = (args: string[], opts: { cwd: string }) => { status: number; stdout: string };

/** Thin `spawnSync` wrapper over the `gh` CLI, scoped to what forge actions need. */
export class GhAdapter {
  constructor(
    private readonly bin: string = "gh",
    private readonly run: GhRunner = (args, opts) => {
      const r = spawnSync(this.bin, args, { cwd: opts.cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout ?? "" };
    },
  ) {}

  /**
   * Resolves the PR number for the current branch, so a human never has to type it in.
   * Returns `null` when there is no open PR for this branch (not an error).
   */
  currentPrNumber(cwd: string): number | null {
    const result = this.run(["pr", "view", "--json", "number"], { cwd });
    if (result.status !== 0) return null;
    try {
      const parsed: unknown = JSON.parse(result.stdout);
      const number = (parsed as { number?: unknown } | null)?.number;
      return typeof number === "number" ? number : null;
    } catch {
      return null;
    }
  }
}
