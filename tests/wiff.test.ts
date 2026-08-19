import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WiffCli, type SpawnFn, type WiffResult } from "../src/wiff.js";

function fakeSpawn(result: WiffResult): { spawn: SpawnFn; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const spawn: SpawnFn = (bin, args, opts) => {
    calls.push([bin, args, opts]);
    return result;
  };
  return { spawn, calls };
}

describe("WiffCli.newIfNeeded", () => {
  it("passes --no-tui --if-needed for a working-copy review", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    const cli = new WiffCli("wiff", spawn);
    cli.newIfNeeded({ cwd: "/repo", fromBase: false });

    expect(calls).toHaveLength(1);
    const [bin, args, opts] = calls[0];
    expect(bin).toBe("wiff");
    expect(args).toEqual(["new", "--no-tui", "--if-needed"]);
    expect(opts).toMatchObject({ cwd: "/repo" });
  });

  it("adds --from-base for a branch review", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    const cli = new WiffCli("wiff", spawn);
    cli.newIfNeeded({ cwd: "/repo", fromBase: true });

    expect(calls[0][1]).toEqual(["new", "--no-tui", "--if-needed", "--from-base"]);
  });

  it("propagates a non-zero exit (no session, no changes)", () => {
    const { spawn } = fakeSpawn({ status: 1, stdout: "", stderr: "nothing to review" });
    const cli = new WiffCli("wiff", spawn);
    const result = cli.newIfNeeded({ cwd: "/repo", fromBase: true });
    expect(result.status).toBe(1);
  });
});

describe("WiffCli.refresh", () => {
  it("runs plain refresh with no extra flags", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    new WiffCli("wiff", spawn).refresh({ cwd: "/repo" });
    expect(calls[0][1]).toEqual(["refresh"]);
    expect(calls[0][2]).toMatchObject({ cwd: "/repo" });
  });
});

describe("WiffCli.forgePull", () => {
  it("puts --forge-token-file before the pull subcommand, with the PR number after", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    const cli = new WiffCli("wiff", spawn, { PATH: "/usr/bin" });
    cli.forgePull({ cwd: "/repo", pr: "42", token: "ghp_secret" });

    const [, args, opts] = calls[0];
    expect(args as string[]).toEqual([
      "forge",
      "--forge-token-file",
      expect.any(String),
      "pull",
      "42",
    ]);
    expect(opts).toMatchObject({ cwd: "/repo", env: { PATH: "/usr/bin" } });
  });

  it("writes the token to a private (0600) file that exists only for the call", () => {
    let capturedPath = "";
    let contentDuringCall = "";
    let modeDuringCall = 0;
    const spawn: SpawnFn = (_bin, args) => {
      capturedPath = args[args.indexOf("--forge-token-file") + 1];
      contentDuringCall = readFileSync(capturedPath, "utf8");
      modeDuringCall = statSync(capturedPath).mode & 0o777;
      return { status: 0, stdout: "", stderr: "" };
    };
    new WiffCli("wiff", spawn).forgePull({ cwd: "/repo", pr: "42", token: "ghp_secret" });

    expect(contentDuringCall).toBe("ghp_secret");
    expect(modeDuringCall).toBe(0o600);
    expect(existsSync(capturedPath)).toBe(false);
  });

  it("never puts the raw token value in argv", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    new WiffCli("wiff", spawn).forgePull({ cwd: "/repo", pr: "42", token: "ghp_secret" });
    expect((calls[0][1] as string[]).join(" ")).not.toContain("ghp_secret");
  });

  it("cleans up the token file even if the spawn call throws", () => {
    let capturedPath = "";
    const spawn: SpawnFn = (_bin, args) => {
      capturedPath = args[args.indexOf("--forge-token-file") + 1];
      throw new Error("boom");
    };
    const cli = new WiffCli("wiff", spawn);
    expect(() => cli.forgePull({ cwd: "/repo", pr: "42", token: "ghp_secret" })).toThrow("boom");
    expect(existsSync(capturedPath)).toBe(false);
  });
});

describe("WiffCli.forgePush", () => {
  it("runs bare forge push with just the token file when no pr/session is given", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    new WiffCli("wiff", spawn).forgePush({ cwd: "/repo", token: "ghp_secret" });
    expect(calls[0][1] as string[]).toEqual(["forge", "--forge-token-file", expect.any(String), "push"]);
  });

  it("includes the PR number and --session when given", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    new WiffCli("wiff", spawn).forgePush({
      cwd: "/repo",
      pr: "42",
      session: "sess-1",
      token: "ghp_secret",
    });
    expect(calls[0][1] as string[]).toEqual([
      "forge",
      "--forge-token-file",
      expect.any(String),
      "push",
      "42",
      "--session",
      "sess-1",
    ]);
  });
});
