import { spawnSync } from "node:child_process";

export interface TokenRunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type TokenRunner = (command: string) => TokenRunResult;

const defaultTokenRunner: TokenRunner = (command) => {
  const r = spawnSync("sh", ["-c", command], { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

export type TokenResult = { ok: true; token: string } | { ok: false; message: string };

/**
 * Runs `[forge] token_command` (default `gh auth token`) to obtain a forge token.
 *
 * The token is returned to the caller to inject into a single `spawnSync` env object — never
 * written to `process.env`, never logged. `command` runs through a real shell (`sh -c`) rather
 * than a hand-rolled argv splitter, since it's a user-authored config string that may itself use
 * shell syntax (pipes, quoting).
 */
export function getForgeToken(command: string, run: TokenRunner = defaultTokenRunner): TokenResult {
  const result = run(command);
  const token = result.stdout.trim();
  if (result.status !== 0 || !token) {
    const detail = result.stderr.trim();
    return {
      ok: false,
      message:
        `wiff: token_command "${command}" did not produce a token` +
        `${detail ? ` (${detail})` : ""}; check that it's configured correctly (e.g. \`gh auth login\`).`,
    };
  }
  return { ok: true, token };
}
