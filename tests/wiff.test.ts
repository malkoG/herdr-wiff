import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WiffCli, withTokenFile, type SpawnFn, type WiffResult } from "../src/wiff.js";

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

describe("withTokenFile", () => {
  it("writes the token to a private (0600) file that exists only for the call", () => {
    let contentDuringCall = "";
    let modeDuringCall = 0;
    let capturedPath = "";
    withTokenFile("ghp_secret", (path) => {
      capturedPath = path;
      contentDuringCall = readFileSync(path, "utf8");
      modeDuringCall = statSync(path).mode & 0o777;
    });

    expect(contentDuringCall).toBe("ghp_secret");
    expect(modeDuringCall).toBe(0o600);
    expect(existsSync(capturedPath)).toBe(false);
  });

  it("cleans up the token file even if fn throws", () => {
    let capturedPath = "";
    expect(() =>
      withTokenFile("ghp_secret", (path) => {
        capturedPath = path;
        throw new Error("boom");
      }),
    ).toThrow("boom");
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

  it("never puts the raw token value in argv", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    new WiffCli("wiff", spawn).forgePush({ cwd: "/repo", token: "ghp_secret" });
    expect((calls[0][1] as string[]).join(" ")).not.toContain("ghp_secret");
  });

  it("adds --agent before the PR number when agent is true", () => {
    // Verified live against a real PR: without --agent, an agent's own replies never get
    // published — plain push only publishes the human's comments.
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    new WiffCli("wiff", spawn).forgePush({ cwd: "/repo", pr: "42", agent: true, token: "t" });
    expect(calls[0][1] as string[]).toEqual([
      "forge",
      "--forge-token-file",
      expect.any(String),
      "push",
      "--agent",
      "42",
    ]);
  });

  it("omits --agent when agent is false or unset", () => {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: "", stderr: "" });
    new WiffCli("wiff", spawn).forgePush({ cwd: "/repo", pr: "42", token: "t" });
    expect(calls[0][1] as string[]).not.toContain("--agent");
  });
});
